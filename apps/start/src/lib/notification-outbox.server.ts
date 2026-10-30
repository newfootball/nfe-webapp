import "@tanstack/react-start/server-only";
import { createHash, randomUUID } from "node:crypto";
import {
	AppwriteException,
	type Models,
	Permission,
	Query,
	Role,
	TablesDB,
} from "node-appwrite";
import { z } from "zod";
import { AuthFailure, client, configuration } from "./auth-context.server";
import type { NotificationEvent } from "./notification-contract";
import { NOTIFICATION_TYPES } from "./notification-contract";
import { ProfileIdSchema } from "./profile-input";

const EventSchema = z.strictObject({
	version: z.literal(1),
	eventId: z.string().min(1).max(128),
	type: z.enum(NOTIFICATION_TYPES),
	actorId: ProfileIdSchema.shape.id.nullable(),
	recipientId: ProfileIdSchema.shape.id,
	targetId: ProfileIdSchema.shape.id,
	entityId: ProfileIdSchema.shape.id,
	occurredAt: z.iso.datetime({ precision: 3 }),
});
export const OUTBOX_ATTEMPTS = 5;
export function notificationId(eventId: string) {
	return createHash("sha256")
		.update(`notification-v1:${eventId}`)
		.digest("hex")
		.slice(0, 36);
}
export function notificationConnection() {
	const c = configuration(),
		databaseId = process.env.START_APPWRITE_DATABASE,
		key = process.env.START_APPWRITE_NOTIFICATION_WRITER_KEY;
	if (!databaseId || !key || key === c.key)
		throw new AuthFailure("unavailable");
	return { databaseId, db: new TablesDB(client(c).setKey(key)) };
}
// Internal-only seam: caller MUST pass its open business transaction. No RPC accepts events.
// The transaction is shared across keys in the same Appwrite project.
export async function stageNotification(
	transactionId: string,
	event: NotificationEvent,
) {
	const e = EventSchema.parse(event);
	if (!e.actorId) throw new Error("Business notification actor required");
	if (e.actorId === e.recipientId) return;
	return stageEvent(transactionId, e, "business");
}
// Offline migration seam: caller supplies trusted typed enum/target metadata.
// Legacy localized content is never parsed to reconstruct an actor.
export function stageLegacyNotification(
	transactionId: string,
	event: NotificationEvent,
) {
	const e = EventSchema.parse(event);
	if (e.actorId !== null || !e.eventId.startsWith("legacy:"))
		throw new Error("Legacy fallback must have unknown actor");
	return stageEvent(transactionId, e, "legacy");
}
async function stageEvent(
	transactionId: string,
	e: NotificationEvent,
	source: "legacy" | "business",
) {
	const c = notificationConnection();
	const { version: _, ...data } = e;
	await c.db.createRow({
		databaseId: c.databaseId,
		tableId: "notification_outbox_v1",
		rowId: notificationId(e.eventId),
		transactionId,
		data: {
			...data,
			source,
			status: "PENDING",
			attempts: 0,
			nextAttemptAt: e.occurredAt,
		},
		permissions: [],
	});
}
export async function notificationTransaction<T>(
	db: TablesDB,
	run: (transactionId: string) => Promise<T>,
) {
	const tx = await db.createTransaction({ ttl: 60 });
	try {
		const result = await run(tx.$id);
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return result;
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
const isMissing = (e: unknown) =>
	e instanceof AppwriteException && e.code === 404;
async function optionalRow(
	db: TablesDB,
	ref: { databaseId: string; tableId: string; rowId: string },
) {
	try {
		return await db.getRow(ref);
	} catch (e) {
		if (!isMissing(e)) throw e;
		return null;
	}
}
// Update+fresh revision check+commit form the optimistic claim fence. Concurrent
// claimers/ack/recovery conflict on the same row; an expired worker cannot commit.
async function fenced<T>(
	row: Models.DefaultRow,
	run: (tx: string) => Promise<T>,
) {
	const c = notificationConnection(),
		ref = {
			databaseId: c.databaseId,
			tableId: "notification_outbox_v1",
			rowId: row.$id,
		};
	return notificationTransaction(c.db, async (tx) => {
		await c.db.updateRow({
			...ref,
			transactionId: tx,
			data: { status: row.status },
		});
		const current = await c.db.getRow(ref);
		if (current.$updatedAt !== row.$updatedAt || current.claim !== row.claim)
			throw new Error("Outbox fence changed");
		return run(tx);
	});
}
async function claim(row: Models.DefaultRow) {
	const now = Date.now();
	if (
		row.status !== "PENDING" ||
		Date.parse(String(row.nextAttemptAt)) > now ||
		(row.leaseUntil && Date.parse(String(row.leaseUntil)) > now)
	)
		return null;
	const c = notificationConnection(),
		token = randomUUID(),
		attempts = Number(row.attempts) + 1;
	await fenced(row, (tx) =>
		c.db.updateRow({
			databaseId: c.databaseId,
			tableId: "notification_outbox_v1",
			rowId: row.$id,
			transactionId: tx,
			data: {
				claim: token,
				attempts,
				leaseUntil: new Date(now + 60000).toISOString(),
				status: attempts > OUTBOX_ATTEMPTS ? "FAILED" : "PENDING",
			},
		}),
	);
	if (attempts > OUTBOX_ATTEMPTS) return null;
	const claimed = await c.db.getRow({
		databaseId: c.databaseId,
		tableId: "notification_outbox_v1",
		rowId: row.$id,
	});
	return claimed.claim === token ? claimed : null;
}
export async function deliverClaim(row: Models.DefaultRow) {
	const c = notificationConnection(),
		ref = {
			databaseId: c.databaseId,
			tableId: "notifications_v1",
			rowId: row.$id,
		};
	if (!row.claim || Date.parse(String(row.leaseUntil)) <= Date.now())
		throw new Error("Expired outbox claim");
	await fenced(row, async (transactionId) => {
		const existing = await optionalRow(c.db, ref);
		if (
			existing &&
			(existing.eventId !== row.eventId ||
				existing.recipientId !== row.recipientId)
		)
			throw new Error("Notification identity conflict");
		// Never update an existing notification: readAt survives create-before-ack replay.
		if (!existing)
			await c.db.createRow({
				...ref,
				transactionId,
				data: {
					eventId: row.eventId,
					type: row.type,
					actorId: row.actorId ?? null,
					recipientId: row.recipientId,
					targetId: row.targetId,
					entityId: row.entityId,
					occurredAt: row.occurredAt,
					source: row.source,
				},
				permissions: [Permission.read(Role.user(String(row.recipientId)))],
			});
		if (Date.parse(String(row.leaseUntil)) <= Date.now())
			throw new Error("Expired outbox claim");
		await c.db.updateRow({
			databaseId: c.databaseId,
			tableId: "notification_outbox_v1",
			rowId: row.$id,
			transactionId,
			data: {
				status: "DELIVERED",
				deliveredAt: new Date().toISOString(),
				leaseUntil: null,
				claim: null,
			},
		});
	});
}
// Explicit operator runner only, bounded both per invocation and per event. No scheduler.
export async function consumeNotifications(limit = 20) {
	if (!Number.isInteger(limit) || limit < 1 || limit > 20)
		throw new Error("Invalid delivery bound");
	const c = notificationConnection(),
		now = new Date().toISOString();
	const rows = await c.db.listRows({
		databaseId: c.databaseId,
		tableId: "notification_outbox_v1",
		queries: [
			Query.equal("status", "PENDING"),
			Query.lessThanEqual("nextAttemptAt", now),
			Query.or([
				Query.isNull("leaseUntil"),
				Query.lessThanEqual("leaseUntil", now),
			]),
			Query.orderAsc("nextAttemptAt"),
			Query.limit(limit),
		],
		total: false,
	});
	let delivered = 0,
		failed = 0;
	for (const row of rows.rows) {
		let owned: Models.DefaultRow | null = null;
		try {
			owned = await claim(row);
			if (!owned) continue;
			await deliverClaim(owned);
			delivered++;
		} catch {
			failed++;
			if (owned) {
				const claimed = owned;
				try {
					await fenced(owned, (tx) =>
						c.db.updateRow({
							databaseId: c.databaseId,
							tableId: "notification_outbox_v1",
							rowId: claimed.$id,
							transactionId: tx,
							data: {
								status:
									Number(claimed.attempts) >= OUTBOX_ATTEMPTS
										? "FAILED"
										: "PENDING",
								nextAttemptAt: new Date(
									Date.now() + 1000 * 2 ** Number(claimed.attempts),
								).toISOString(),
								claim: null,
								leaseUntil: null,
							},
						}),
					);
				} catch {
					/* A newer claim owns recovery; never overwrite it. */
				}
			}
		}
	}
	return { examined: rows.rows.length, delivered, failed };
}
export async function recoverNotification(outboxId: string, reason: string) {
	if (!reason.trim() || reason.length > 255)
		throw new Error("Recovery reason required");
	const c = notificationConnection(),
		row = await c.db.getRow({
			databaseId: c.databaseId,
			tableId: "notification_outbox_v1",
			rowId: outboxId,
		});
	if (row.status !== "FAILED")
		throw new Error("Only failed events may be recovered");
	await fenced(row, async (transactionId) => {
		await c.db.createRow({
			databaseId: c.databaseId,
			tableId: "notification_recovery_v1",
			rowId: randomUUID(),
			transactionId,
			data: {
				outboxId,
				reason,
				recoveredAt: new Date().toISOString(),
				priorAttempts: row.attempts,
			},
			permissions: [],
		});
		await c.db.updateRow({
			databaseId: c.databaseId,
			tableId: "notification_outbox_v1",
			rowId: outboxId,
			transactionId,
			data: {
				status: "PENDING",
				attempts: 0,
				nextAttemptAt: new Date().toISOString(),
				claim: null,
				leaseUntil: null,
			},
		});
	});
}
