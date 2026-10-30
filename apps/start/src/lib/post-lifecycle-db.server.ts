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
	tx?: string,
) {
	const live = await db.getRow(ref(operationTable, operationId, tx));
	if (
		live.token !== token ||
		!live.leaseUntil ||
		Date.parse(live.leaseUntil) <= Date.now()
	)
		throw new LifecycleConflict();
	return live;
}
export async function fencedLifecycleCheckpoint(
	db: TablesDB,
	operationId: string,
	token: string,
	data: Record<string, unknown>,
	run?: (tx: string) => Promise<void>,
) {
	return lifecycleTransaction(db, async (tx) => {
		await assertLifecycleLease(db, operationId, token, tx);
		if (run) await run(tx);
		return db.updateRow({
			...ref(operationTable, operationId, tx),
			data: {
				...data,
				token: null,
				leaseUntil: null,
				updatedAt: new Date().toISOString(),
			},
		});
	});
}
