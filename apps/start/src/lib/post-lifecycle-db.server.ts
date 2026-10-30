import "@tanstack/react-start/server-only";
import { AppwriteException, type Models, Query, TablesDB } from "node-appwrite";
import { AuthFailure, client, configuration } from "./auth-context.server";
import { databaseId } from "./media-db.server";

export const operationTable = "post_lifecycle_operations";
export const lockTable = "post_lifecycle_locks";
export const BATCH_SIZE = 20;
export function lifecycleDB() {
	const key = process.env.START_APPWRITE_LIFECYCLE_WRITER_KEY;
	if (
		!key ||
		Object.entries(process.env).some(
			([name, value]) =>
				name !== "START_APPWRITE_LIFECYCLE_WRITER_KEY" &&
				name.startsWith("START_APPWRITE_") &&
				name.endsWith("_KEY") &&
				value === key,
		)
	)
		throw new AuthFailure("unavailable");
	return new TablesDB(client(configuration()).setKey(key));
}
export const ref = (
	tableId: string,
	rowId: string,
	transactionId?: string,
) => ({ databaseId: databaseId(), tableId, rowId, transactionId });
export async function optionalRow(
	db: TablesDB,
	table: string,
	id: string,
	tx?: string,
): Promise<Models.DefaultRow | null> {
	try {
		return await db.getRow<Models.DefaultRow>(ref(table, id, tx));
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
export async function lifecycleTransaction<T>(
	db: TablesDB,
	run: (tx: string) => Promise<T>,
) {
	const tx = await db.createTransaction({ ttl: 60 });
	try {
		const v = await run(tx.$id);
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return v;
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
export async function postRows(
	db: TablesDB,
	tableId: string,
	postId: string,
	limit = BATCH_SIZE,
	tx?: string,
) {
	return (
		await db.listRows({
			databaseId: databaseId(),
			tableId,
			transactionId: tx,
			queries: [Query.equal("postId", postId), Query.limit(limit)],
			total: false,
		})
	).rows;
}

export class LifecycleConflict extends Error {}
export async function assertLifecycleLease(
	db: TablesDB,
	operationId: string,
	token: string,
) {
	// Deliberately outside a transaction: a staged write must never satisfy this read.
	const live = await db.getRow(ref(operationTable, operationId));
	if (
		live.token !== token ||
		!live.leaseUntil ||
		Date.parse(live.leaseUntil) <= Date.now()
	)
		throw new LifecycleConflict();
	return live;
}
export async function claimLifecycleOperation(
	db: TablesDB,
	operationId: string,
	owner: string,
	token: string,
) {
	return lifecycleTransaction(db, async (tx) => {
		// Anchor first, then read live. A takeover before the anchor is seen by
		// the read; a takeover after it conflicts at commit (accepted Appwrite contract).
		await db.updateRow({
			...ref(operationTable, operationId, tx),
			data: { updatedAt: new Date().toISOString() },
		});
		const current = await db.getRow(ref(operationTable, operationId));
		if (current.ownerId !== owner) throw new AuthFailure("forbidden");
		if (current.phase === "DONE") return current;
		if (current.leaseUntil && Date.parse(current.leaseUntil) > Date.now())
			throw new LifecycleConflict();
		const lock = await db.getRow(ref(lockTable, current.postId, tx));
		if (lock.operationId !== current.$id || lock.ownerId !== owner)
			throw new AuthFailure("forbidden");
		return db.updateRow({
			...ref(operationTable, operationId, tx),
			data: { token, leaseUntil: new Date(Date.now() + 120000).toISOString() },
		});
	});
}
export async function fencedLifecycleCheckpoint(
	db: TablesDB,
	operationId: string,
	token: string,
	data: Record<string, unknown>,
	run?: (tx: string) => Promise<void>,
) {
	return lifecycleTransaction(db, async (tx) => {
		const staged = await db.updateRow({
			...ref(operationTable, operationId, tx),
			data: {
				...data,
				token: null,
				leaseUntil: null,
				updatedAt: new Date().toISOString(),
			},
		});
		await assertLifecycleLease(db, operationId, token);
		if (run) await run(tx);
		return staged;
	});
}
