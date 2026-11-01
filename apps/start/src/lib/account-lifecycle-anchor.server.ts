import "@tanstack/react-start/server-only";
import { AppwriteException, type Models, TablesDB } from "node-appwrite";
import {
	type StartAccountDeletion,
	StartAccountDeletionSchema,
} from "./account-deletion-contract";
import {
	AuthFailure,
	client,
	configuration,
	identity,
	mutation,
} from "./auth-context.server";
import type { Validated } from "./profile-input";

const anchors = "account_lifecycle_anchors";
const operations = "account_lifecycle_operations";
export function accountLifecycleConnection() {
	const config = configuration();
	const databaseId = process.env.START_APPWRITE_DATABASE;
	const key = process.env.START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY;
	if (
		!databaseId ||
		!key ||
		Object.entries(process.env).some(
			([name, value]) =>
				name.startsWith("START_APPWRITE_") &&
				name.endsWith("_KEY") &&
				name !== "START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY" &&
				value === key,
		)
	)
		throw new AuthFailure("unavailable");
	return { databaseId, db: new TablesDB(client(config).setKey(key)) };
}
async function optional(
	db: TablesDB,
	databaseId: string,
	tableId: string,
	rowId: string,
): Promise<Models.DefaultRow | null> {
	try {
		return await db.getRow<Models.DefaultRow>({ databaseId, tableId, rowId });
	} catch (e) {
		if (
			e instanceof AppwriteException &&
			e.code === 404 &&
			e.type === "row_not_found"
		)
			return null;
		throw e;
	}
}
export async function isAccountActive(userId: string) {
	const { db, databaseId } = accountLifecycleConnection();
	const row = await optional(db, databaseId, anchors, userId);
	return !row || row.state === "ACTIVE";
}
export async function requireActiveAccount(userId: string) {
	if (!(await isAccountActive(userId))) throw new AuthFailure("forbidden");
}
async function anchor(
	db: TablesDB,
	databaseId: string,
	transactionId: string,
	userId: string,
	state: "ACTIVE" | "PREPARING",
	operationId: string | null,
) {
	const ref = { databaseId, tableId: anchors, rowId: userId };
	const before = await optional(db, databaseId, anchors, userId);
	if (before && before.state !== "ACTIVE") throw new AuthFailure("forbidden");
	const data = { state, operationId, updatedAt: new Date().toISOString() };
	try {
		if (before) await db.updateRow({ ...ref, transactionId, data });
		else await db.createRow({ ...ref, transactionId, data, permissions: [] });
	} catch (error) {
		if (error instanceof AppwriteException && error.code === 409) {
			const live = await optional(db, databaseId, anchors, userId);
			if (live && live.state !== "ACTIVE") throw new AuthFailure("forbidden");
			if (
				!before &&
				live?.state === "ACTIVE" &&
				error.type === "row_already_exists"
			)
				throw new AppwriteException(
					"Account anchor contention",
					409,
					"account_anchor_conflict",
				);
		}
		throw error;
	}
	// A committed withdrawal before our staged write must be noticed; a later
	// withdrawal conflicts on this same row at transaction commit.
	const live = await optional(db, databaseId, anchors, userId);
	if (live && live.state !== "ACTIVE") throw new AuthFailure("forbidden");
	if (before ? !live || live.$updatedAt !== before.$updatedAt : !!live)
		throw new AppwriteException(
			"Account anchor contention",
			409,
			"account_anchor_conflict",
		);
}
export async function fenceAccountsWith(
	db: TablesDB,
	databaseId: string,
	transactionId: string,
	ids: readonly string[],
) {
	for (const id of [...new Set(ids)].sort()) {
		if (!id) throw new AuthFailure("invalid");
		await anchor(db, databaseId, transactionId, id, "ACTIVE", null);
	}
}
export async function fenceAccounts(
	transactionId: string,
	ids: readonly string[],
) {
	const { db, databaseId } = accountLifecycleConnection();
	return fenceAccountsWith(db, databaseId, transactionId, ids);
}

// Internal only. No RPC exports this function until the full deletion lifecycle exists.
export async function beginAccountDeletion(
	input: Validated<StartAccountDeletion>,
) {
	return beginAuthorized(input, {
		checkOrigin: mutation,
		getIdentity: async () => (await identity()).viewer.id,
		start: async (ownerId, operationId) => {
			const { db, databaseId } = accountLifecycleConnection();
			return beginAccountDeletionWith(db, databaseId, ownerId, operationId);
		},
	});
}
export async function beginAuthorized(
	input: Validated<StartAccountDeletion>,
	services: {
		checkOrigin: () => unknown;
		getIdentity: () => Promise<string>;
		start: (
			ownerId: string,
			operationId: string,
		) => Promise<{ operationId: string; phase: string }>;
	},
) {
	services.checkOrigin();
	const ownerId = await services.getIdentity();
	if (!ownerId || !input.valid) throw new AuthFailure("invalid");
	const parsed = StartAccountDeletionSchema.safeParse(input.data);
	if (!parsed.success) throw new AuthFailure("invalid");
	return services.start(ownerId, parsed.data.requestId);
}

export async function beginAccountDeletionWith(
	db: TablesDB,
	databaseId: string,
	ownerId: string,
	operationId: string,
) {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			return await beginOnce(db, databaseId, ownerId, operationId);
		} catch (error) {
			if (
				!(error instanceof AppwriteException && error.code === 409) ||
				attempt === 3
			)
				throw error;
		}
	}
	throw new AuthFailure("unavailable");
}
async function beginOnce(
	db: TablesDB,
	databaseId: string,
	ownerId: string,
	operationId: string,
) {
	const previous = await optional(db, databaseId, operations, operationId);
	if (previous) {
		if (previous.ownerId !== ownerId) throw new AuthFailure("forbidden");
		return { operationId, phase: String(previous.phase) };
	}
	const tx = await db.createTransaction({ ttl: 60 });
	try {
		await anchor(db, databaseId, tx.$id, ownerId, "PREPARING", operationId);
		const now = new Date().toISOString();
		await db.createRow({
			databaseId,
			tableId: operations,
			rowId: operationId,
			transactionId: tx.$id,
			data: {
				ownerId,
				phase: "PREPARING",
				step: 0,
				createdAt: now,
				updatedAt: now,
			},
			permissions: [],
		});
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return { operationId, phase: "PREPARING" };
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
