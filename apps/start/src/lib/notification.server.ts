import "@tanstack/react-start/server-only";
import { AppwriteException, type Models, Query, TablesDB } from "node-appwrite";
import {
	AuthFailure,
	boundary,
	client,
	configuration,
	identity,
	mutation,
} from "./auth-context.server";
import {
	interactionCursor,
	parseInteractionCursor,
} from "./interactions-input";
import type { Notification, NotificationPage } from "./notification-contract";
import type {
	NotificationMarkInput,
	NotificationPageInput,
} from "./notification-input";
import { notificationConnection } from "./notification-outbox.server";
import type { Validated } from "./profile-input";

const absent = (e: unknown) =>
	e instanceof AppwriteException && [401, 403, 404].includes(e.code);
function databaseId() {
	const id = process.env.START_APPWRITE_DATABASE;
	if (!id) throw new AuthFailure("unavailable");
	return id;
}
async function publicRow(tableId: string, id: string) {
	try {
		return await new TablesDB(client(configuration())).getRow({
			databaseId: databaseId(),
			tableId,
			rowId: id,
		});
	} catch (e) {
		if (!absent(e)) throw e;
		return null;
	}
}
async function presentation(row: Models.DefaultRow): Promise<Notification> {
	const actor = row.actorId
		? await publicRow("profiles", String(row.actorId))
		: null;
	let available = false;
	if (row.type === "FOLLOW") {
		const target = await publicRow("profiles", String(row.targetId));
		available = !!target?.isOnboarded;
	} else if (row.type === "LIKE" || row.type === "COMMENT") {
		const post = await publicRow("posts", String(row.targetId));
		if (post?.status === "PUBLISHED") {
			const author = await publicRow("profiles", String(post.userId));
			available = !!author?.isOnboarded;
		}
	}
	// MESSAGE target linking stays disabled until accepted #59 integration proves membership.
	return {
		id: row.$id,
		type: row.type,
		actor: {
			id: actor?.isOnboarded ? String(row.actorId) : null,
			name:
				actor?.isOnboarded && typeof actor.name === "string"
					? actor.name
					: null,
		},
		target: { id: String(row.targetId), available },
		metadata: { entityId: String(row.entityId), source: row.source },
		createdAt: new Date(String(row.occurredAt)).toISOString(),
		readAt: row.readAt ? new Date(String(row.readAt)).toISOString() : null,
	};
}
export function readNotifications(input: Validated<NotificationPageInput>) {
	return boundary(async (): Promise<NotificationPage> => {
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		if (input.data.viewerId !== viewer.id) throw new AuthFailure("forbidden");
		const db = new TablesDB(sessionClient),
			scope = `notifications:${viewer.id}`;
		let pivot: ReturnType<typeof parseInteractionCursor>;
		try {
			pivot = parseInteractionCursor(scope, input.data.cursor ?? null);
		} catch {
			throw new AuthFailure("invalid");
		}
		const queries = [
			Query.equal("recipientId", viewer.id),
			Query.orderDesc("occurredAt"),
			Query.orderDesc("$id"),
			Query.limit(21),
		];
		if (pivot)
			queries.push(
				Query.or([
					Query.lessThan("occurredAt", pivot.time),
					Query.and([
						Query.equal("occurredAt", pivot.time),
						Query.lessThan("$id", pivot.id),
					]),
				]),
			);
		const [r, count] = await Promise.all([
			db.listRows({
				databaseId: databaseId(),
				tableId: "notifications_v1",
				queries,
				total: false,
			}),
			db.listRows({
				databaseId: databaseId(),
				tableId: "notifications_v1",
				queries: [
					Query.equal("recipientId", viewer.id),
					Query.isNull("readAt"),
					Query.limit(1),
					Query.select(["$id"]),
				],
				total: true,
			}),
		]);
		if (r.rows.some((row) => row.recipientId !== viewer.id))
			throw new AuthFailure("forbidden");
		const last = r.rows[19];
		return {
			viewerId: viewer.id,
			notifications: await Promise.all(r.rows.slice(0, 20).map(presentation)),
			unread: count.total,
			nextCursor:
				r.rows.length > 20 && last
					? interactionCursor(scope, String(last.occurredAt), last.$id)
					: null,
		};
	});
}
export function markNotifications(input: Validated<NotificationMarkInput>) {
	return boundary(async () => {
		mutation();
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		if (input.data.viewerId !== viewer.id) throw new AuthFailure("forbidden");
		const db = new TablesDB(sessionClient),
			c = notificationConnection();
		const queries = [
			Query.equal("recipientId", viewer.id),
			Query.isNull("readAt"),
			Query.limit(20),
			Query.orderAsc("$id"),
		];
		if (input.data.mode === "one")
			queries.push(Query.equal("$id", input.data.id));
		const rows = await db.listRows({
			databaseId: c.databaseId,
			tableId: "notifications_v1",
			queries,
			total: false,
		});
		for (const row of rows.rows) {
			if (row.recipientId !== viewer.id) throw new AuthFailure("forbidden");
			// ACL intentionally grants recipient read only: direct SDK cannot forge type/actor/recipient.
			await c.db.updateRow({
				databaseId: c.databaseId,
				tableId: "notifications_v1",
				rowId: row.$id,
				data: { readAt: new Date().toISOString() },
			});
		}
		return {
			viewerId: viewer.id,
			marked: rows.rows.length,
			more: input.data.mode === "all" && rows.rows.length === 20,
		};
	});
}
