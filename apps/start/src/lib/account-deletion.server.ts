import "@tanstack/react-start/server-only";
import {
	AppwriteException,
	type Models,
	Query,
	type TablesDB,
	Users,
} from "node-appwrite";
import {
	ResumeAccountDeletionSchema,
	type StartAccountDeletion,
} from "./account-deletion-contract";
import {
	type AccountAssetInventory,
	inventoryAccountAsset,
	purgeAccountAsset,
} from "./account-deletion-storage.server";
import {
	accountLifecycleConnection,
	beginAccountDeletion,
} from "./account-lifecycle-anchor.server";
import {
	AuthFailure,
	boundary,
	client,
	configuration,
	identity,
	mutation,
} from "./auth-context.server";
import type { Validated } from "./profile-input";

const operations = "account_lifecycle_operations",
	anchors = "account_lifecycle_anchors",
	batch = 20;
class AccountLeaseContention extends Error {}
type Progress = { operationId: string; phase: string; done: boolean };
function failAt(point: string) {
	const project = process.env.START_ACCOUNT_DELETION_SYNTHETIC_PROJECT;
	const endpoint = process.env.START_APPWRITE_ENDPOINT ?? "";
	if (
		!project ||
		project !== process.env.START_APPWRITE_PROJECT ||
		!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(endpoint)
	)
		return;
	if (process.env.START_ACCOUNT_DELETION_FAILURE_POINT === `crash:${point}`)
		process.exit(86);
	if (process.env.START_ACCOUNT_DELETION_FAILURE_POINT === point)
		throw new Error("Synthetic account lifecycle interruption");
}
const dto = (op: Models.DefaultRow): Progress => ({
	operationId: op.$id,
	phase: String(op.phase),
	done: op.phase === "DONE",
});
const ref = (
	databaseId: string,
	tableId: string,
	rowId: string,
	transactionId?: string,
) => ({ databaseId, tableId, rowId, transactionId });
const missing = (e: unknown) =>
	e instanceof AppwriteException && e.code === 404;
async function optional(
	db: TablesDB,
	databaseId: string,
	tableId: string,
	rowId: string,
) {
	try {
		return await db.getRow<Models.DefaultRow>(ref(databaseId, tableId, rowId));
	} catch (e) {
		if (missing(e)) return null;
		throw e;
	}
}
async function transaction<T>(db: TablesDB, fn: (tx: string) => Promise<T>) {
	const tx = await db.createTransaction({ ttl: 60 });
	try {
		const result = await fn(tx.$id);
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return result;
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
async function rows(
	db: TablesDB,
	databaseId: string,
	tableId: string,
	field: string,
	value: string,
) {
	return (
		await db.listRows({
			databaseId,
			tableId,
			queries: [Query.equal(field, value), Query.limit(batch)],
			total: false,
		})
	).rows;
}
function users() {
	const config = configuration(),
		key = process.env.START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY;
	if (!key) throw new AuthFailure("unavailable");
	return new Users(client(config).setKey(key));
}
async function revoke(ownerId: string) {
	const u = users();
	try {
		await u.updateStatus({ userId: ownerId, status: false });
		await u.deleteSessions({ userId: ownerId });
	} catch (e) {
		if (!missing(e)) throw e;
	}
}
async function claim(
	db: TablesDB,
	databaseId: string,
	operationId: string,
	token: string,
) {
	return transaction(db, async (tx) => {
		await db.updateRow({
			...ref(databaseId, operations, operationId, tx),
			data: { updatedAt: new Date().toISOString() },
		});
		const live = await db.getRow<Models.DefaultRow>(
			ref(databaseId, operations, operationId),
		);
		if (live.phase === "DONE") return live;
		if (live.leaseUntil && Date.parse(live.leaseUntil) > Date.now())
			throw new AccountLeaseContention();
		return db.updateRow<Models.DefaultRow>({
			...ref(databaseId, operations, operationId, tx),
			data: { token, leaseUntil: new Date(Date.now() + 120_000).toISOString() },
		});
	});
}
async function assertLease(
	db: TablesDB,
	databaseId: string,
	operationId: string,
	token: string,
) {
	const live = await db.getRow<Models.DefaultRow>(
		ref(databaseId, operations, operationId),
	);
	if (
		live.token !== token ||
		!live.leaseUntil ||
		Date.parse(live.leaseUntil) <= Date.now()
	)
		throw new AuthFailure("unavailable");
}
async function checkpoint(
	db: TablesDB,
	databaseId: string,
	op: Models.DefaultRow,
	token: string,
	data: Record<string, unknown>,
	apply?: (tx: string) => Promise<void>,
) {
	return transaction(db, async (tx) => {
		const updated = await db.updateRow<Models.DefaultRow>({
			...ref(databaseId, operations, op.$id, tx),
			data: {
				...data,
				token: null,
				leaseUntil: null,
				updatedAt: new Date().toISOString(),
			},
		});
		await assertLease(db, databaseId, op.$id, token);
		if (apply) await apply(tx);
		return updated;
	});
}
const cleanup = [
	["messages", "fromUserId"],
	["messages", "toUserId"],
	["message_conversations", "participantA"],
	["message_conversations", "participantB"],
	["message_limits", "senderId"],
	["follows", "followerId"],
	["follows", "followingId"],
	["likes", "userId"],
	["favorites", "userId"],
	["comments", "userId"],
	["signals", "userId"],
	["notifications", "userId"],
	["notifications_v1", "actorId"],
	["notifications_v1", "recipientId"],
	["notification_outbox_v1", "actorId"],
	["notification_outbox_v1", "recipientId"],
] as const;
async function eraseBatch(
	db: TablesDB,
	databaseId: string,
	op: Models.DefaultRow,
	token: string,
	ownerId: string,
) {
	const stage = cleanup[Number(op.step)];
	if (!stage)
		return checkpoint(db, databaseId, op, token, { phase: "POSTS", step: 0 });
	const [table, field] = stage,
		all = await rows(db, databaseId, table, field, ownerId),
		found = table === "notification_outbox_v1" ? all.slice(0, 1) : all;
	if (table === "notification_outbox_v1" && found[0]) {
		const children = await rows(
			db,
			databaseId,
			"notification_recovery_v1",
			"outboxId",
			found[0].$id,
		);
		if (children.length)
			return checkpoint(db, databaseId, op, token, {}, async (tx) => {
				for (const child of children)
					await db.deleteRow(
						ref(databaseId, "notification_recovery_v1", child.$id, tx),
					);
			});
	}
	return checkpoint(
		db,
		databaseId,
		op,
		token,
		{
			step:
				table === "notification_outbox_v1"
					? found.length === 0
						? Number(op.step) + 1
						: op.step
					: found.length < batch
						? Number(op.step) + 1
						: op.step,
		},
		async (tx) => {
			for (const item of found) {
				if (
					table === "notification_outbox_v1" &&
					(
						await rows(
							db,
							databaseId,
							"notification_recovery_v1",
							"outboxId",
							item.$id,
						)
					).length
				)
					throw new AuthFailure("unavailable");
				await db.deleteRow(ref(databaseId, table, item.$id, tx));
			}
		},
	);
}
async function erasePosts(
	db: TablesDB,
	databaseId: string,
	op: Models.DefaultRow,
	token: string,
	ownerId: string,
) {
	const post = (await rows(db, databaseId, "posts", "userId", ownerId))[0];
	if (!post)
		return checkpoint(db, databaseId, op, token, { phase: "ASSETS", step: 0 });
	const lock = await optional(db, databaseId, "post_lifecycle_locks", post.$id);
	if (lock) {
		const journal = await optional(
			db,
			databaseId,
			"post_lifecycle_operations",
			String(lock.operationId),
		);
		if (
			lock.ownerId !== ownerId ||
			!journal ||
			journal.ownerId !== ownerId ||
			journal.postId !== post.$id
		)
			return checkpoint(db, databaseId, op, token, {
				phase: "BLOCKED",
				blockedPhase: "POSTS",
			});
		if (
			journal.leaseUntil &&
			Date.parse(String(journal.leaseUntil)) > Date.now()
		)
			return checkpoint(db, databaseId, op, token, {});
	}
	for (const table of ["likes", "favorites", "comments", "signals", "media"]) {
		const found = await rows(db, databaseId, table, "postId", post.$id);
		if (table === "media") {
			for (const media of found) {
				const asset = await optional(db, databaseId, "media_assets", media.$id);
				if (
					!asset ||
					asset.ownerId !== ownerId ||
					media.ownerId !== ownerId ||
					asset.bucket !== media.bucket ||
					asset.objectKey !== media.objectKey
				)
					return checkpoint(db, databaseId, op, token, {
						phase: "BLOCKED",
						blockedPhase: String(op.phase),
					});
			}
		}
		if (found.length)
			return checkpoint(db, databaseId, op, token, {}, async (tx) => {
				for (const item of found)
					await db.deleteRow(ref(databaseId, table, item.$id, tx));
			});
	}
	return checkpoint(db, databaseId, op, token, {}, async (tx) => {
		for (const table of ["post_private"])
			if (await optional(db, databaseId, table, post.$id))
				await db.deleteRow(ref(databaseId, table, post.$id, tx));
		await db.deleteRow(ref(databaseId, "posts", post.$id, tx));
	});
}
export async function resumeAccountDeletionOperation(
	operationId: string,
): Promise<Progress> {
	const parsed = ResumeAccountDeletionSchema.parse({ operationId });
	const { db, databaseId } = accountLifecycleConnection(),
		token = crypto.randomUUID();
	const op = await claim(db, databaseId, parsed.operationId, token);
	if (op.phase === "DONE") return dto(op);
	const ownerId = String(op.ownerId);
	try {
		if (op.phase === "PREPARING") {
			await revoke(ownerId);
			return dto(
				await checkpoint(db, databaseId, op, token, {
					phase: "DELETING",
					step: 0,
				}),
			);
		}
		if (op.phase === "DELETING")
			return dto(await eraseBatch(db, databaseId, op, token, ownerId));
		if (op.phase === "POSTS")
			return dto(await erasePosts(db, databaseId, op, token, ownerId));
		if (op.phase === "ASSETS") {
			const asset = op.inventoryJson
				? typeof op.currentId === "string" && op.currentId
					? await optional(db, databaseId, "media_assets", op.currentId)
					: null
				: (await rows(db, databaseId, "media_assets", "ownerId", ownerId))[0];
			if (op.inventoryJson && (!asset || asset.ownerId !== ownerId))
				return dto(
					await checkpoint(db, databaseId, op, token, {
						phase: "BLOCKED",
						blockedPhase: "ASSETS",
					}),
				);
			if (
				!asset &&
				(await rows(db, databaseId, "media", "ownerId", ownerId)).length
			)
				return dto(
					await checkpoint(db, databaseId, op, token, {
						phase: "BLOCKED",
						blockedPhase: String(op.phase),
					}),
				);
			if (!asset)
				return dto(
					await checkpoint(db, databaseId, op, token, { phase: "FINALIZE" }),
				);
			if (["INITIALIZING", "FINALIZING"].includes(String(asset.state))) {
				const inFlight =
					asset.leaseUntil && Date.parse(String(asset.leaseUntil)) > Date.now();
				return dto(
					await checkpoint(
						db,
						databaseId,
						op,
						token,
						inFlight ? {} : { phase: "BLOCKED", blockedPhase: "ASSETS" },
					),
				);
			}
			if (!op.inventoryJson) {
				const inventory = await inventoryAccountAsset(db, asset, ownerId);
				return dto(
					await checkpoint(db, databaseId, op, token, {
						currentId: asset.$id,
						inventoryJson: JSON.stringify(inventory),
					}),
				);
			}
			const inventory = JSON.parse(
				String(op.inventoryJson),
			) as AccountAssetInventory;
			if (
				inventory.id !== asset.$id ||
				inventory.ownerId !== ownerId ||
				op.currentId !== asset.$id
			)
				throw new AuthFailure("forbidden");
			await purgeAccountAsset(db, inventory, () =>
				assertLease(db, databaseId, op.$id, token),
			);
			failAt("after-version-delete");
			return dto(
				await checkpoint(
					db,
					databaseId,
					op,
					token,
					{ inventoryJson: null, currentId: null },
					async (tx) => {
						await db.deleteRow(ref(databaseId, "media_assets", asset.$id, tx));
					},
				),
			);
		}
		if (op.phase === "BLOCKED") {
			if (
				!["DELETING", "POSTS", "ASSETS", "FINALIZE"].includes(
					String(op.blockedPhase),
				)
			)
				throw new AuthFailure("forbidden");
			return dto(
				await checkpoint(db, databaseId, op, token, {
					phase: op.blockedPhase,
					blockedPhase: null,
				}),
			);
		}
		if (op.phase === "FINALIZE") {
			const journals = await rows(
				db,
				databaseId,
				"post_lifecycle_operations",
				"ownerId",
				ownerId,
			);
			if (journals.length)
				return dto(
					await checkpoint(db, databaseId, op, token, {}, async (tx) => {
						for (const j of journals) {
							const lock = await optional(
								db,
								databaseId,
								"post_lifecycle_locks",
								String(j.postId),
							);
							if (
								lock &&
								(lock.ownerId !== ownerId || lock.operationId !== j.$id)
							)
								throw new AuthFailure("forbidden");
							if (!lock && j.phase !== "DONE")
								throw new AuthFailure("forbidden");
							if (lock)
								await db.deleteRow(
									ref(databaseId, "post_lifecycle_locks", String(j.postId), tx),
								);
							await db.deleteRow(
								ref(databaseId, "post_lifecycle_operations", j.$id, tx),
							);
						}
					}),
				);
			await assertLease(db, databaseId, op.$id, token);
			try {
				await users().delete({ userId: ownerId });
				failAt("after-auth-delete");
			} catch (e) {
				if (!missing(e)) throw e;
			}
			return dto(
				await checkpoint(
					db,
					databaseId,
					op,
					token,
					{
						phase: "DONE",
						ownerId: null,
						inventoryJson: null,
						currentId: null,
					},
					async (tx) => {
						for (const table of ["private_profiles", "profiles"])
							if (await optional(db, databaseId, table, ownerId))
								await db.deleteRow(ref(databaseId, table, ownerId, tx));
						await db.updateRow({
							...ref(databaseId, anchors, ownerId, tx),
							data: {
								state: "DONE",
								operationId: null,
								updatedAt: new Date().toISOString(),
							},
						});
					},
				),
			);
		}
		throw new AuthFailure("unavailable");
	} catch (e) {
		if (
			op.phase === "ASSETS" &&
			e instanceof AuthFailure &&
			e.reason === "forbidden"
		)
			return dto(
				await checkpoint(db, databaseId, op, token, {
					phase: "BLOCKED",
					blockedPhase: String(op.phase),
				}),
			);
		try {
			await checkpoint(db, databaseId, op, token, {});
		} catch {}
		throw e;
	}
}
export function startOwnAccountDeletion(
	input: Validated<StartAccountDeletion>,
) {
	return boundary(async () => {
		const op = await beginAccountDeletion(input);
		try {
			return await resumeAccountDeletionOperation(op.operationId);
		} catch {
			return {
				operationId: op.operationId,
				phase: op.phase,
				done: op.phase === "DONE",
			};
		}
	});
}
export function resumeAccountDeletionAsAdmin(
	input: Validated<{ operationId: string }>,
) {
	return boundary(async () => {
		mutation();
		const { viewer } = await identity();
		if (viewer.role !== "admin") throw new AuthFailure("forbidden");
		if (!input.valid) throw new AuthFailure("invalid");
		return resumeAccountDeletionOperation(
			ResumeAccountDeletionSchema.parse(input.data).operationId,
		);
	});
}
export async function consumeAccountDeletions(limit = 20) {
	if (!Number.isInteger(limit) || limit < 1 || limit > 20)
		throw new AuthFailure("invalid");
	const { db, databaseId } = accountLifecycleConnection();
	const result = await db.listRows({
		databaseId,
		tableId: operations,
		queries: [
			Query.equal("phase", [
				"PREPARING",
				"DELETING",
				"POSTS",
				"ASSETS",
				"FINALIZE",
			]),
			Query.or([
				Query.isNull("leaseUntil"),
				Query.lessThanEqual("leaseUntil", new Date().toISOString()),
			]),
			Query.limit(limit),
		],
		total: false,
	});
	const progress = await Promise.all(
		result.rows.map(async (row) => {
			try {
				return await resumeAccountDeletionOperation(row.$id);
			} catch (error) {
				if (
					error instanceof AccountLeaseContention ||
					(error instanceof AppwriteException &&
						error.code === 409 &&
						error.type === "transaction_conflict")
				)
					return null;
				throw error;
			}
		}),
	);
	return progress.filter((value): value is Progress => value !== null);
}
