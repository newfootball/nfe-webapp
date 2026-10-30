import "@tanstack/react-start/server-only";
import {
	AppwriteException,
	type Models,
	Permission,
	Role,
	TablesDB,
} from "node-appwrite";
import {
	AuthFailure,
	client,
	configuration,
	identity,
} from "./auth-context.server";
import type { UploadAsset } from "./media-contract";
import { acceptsOperationResult } from "./media-policy";

export const assetTable = "media_assets";
export function databaseId() {
	const id = process.env.START_APPWRITE_DATABASE;
	if (!id) throw new AuthFailure("unavailable");
	return id;
}
export function mediaDB(write = false) {
	const key =
		process.env[
			write
				? "START_APPWRITE_MEDIA_WRITER_KEY"
				: "START_APPWRITE_MEDIA_READER_KEY"
		];
	if (
		!key ||
		[
			process.env.START_APPWRITE_SESSION_KEY,
			process.env.START_APPWRITE_PROFILE_WRITER_KEY,
			process.env[
				write
					? "START_APPWRITE_MEDIA_READER_KEY"
					: "START_APPWRITE_MEDIA_WRITER_KEY"
			],
		].includes(key)
	)
		throw new AuthFailure("unavailable");
	return new TablesDB(client(configuration()).setKey(key));
}
export const privateACL = (id: string) => [Permission.read(Role.user(id))];
export const publicACL = [Permission.read(Role.any())];
export async function row(
	db: TablesDB,
	tableId: string,
	rowId: string,
	transactionId?: string,
) {
	return db.getRow({ databaseId: databaseId(), tableId, rowId, transactionId });
}
export async function maybeRow(db: TablesDB, tableId: string, rowId: string) {
	try {
		return await row(db, tableId, rowId);
	} catch (e) {
		if (e instanceof AppwriteException && e.code === 404) return null;
		throw e;
	}
}
export async function mediaSelf() {
	const context = await identity();
	const p = await row(
		new TablesDB(context.sessionClient),
		"profiles",
		context.viewer.id,
	);
	if (!p.isOnboarded) throw new AuthFailure("forbidden");
	return { ownerId: context.viewer.id, profile: p };
}
export function assertOwner(asset: Models.DefaultRow, ownerId: string) {
	if (asset.ownerId !== ownerId) throw new AuthFailure("forbidden");
}
export async function ownAsset(id: string, ownerId: string, db = mediaDB()) {
	const a = await row(db, assetTable, id);
	assertOwner(a, ownerId);
	return a;
}
export async function patch(
	db: TablesDB,
	id: string,
	data: Record<string, unknown>,
	transactionId?: string,
) {
	return db.updateRow({
		databaseId: databaseId(),
		tableId: assetTable,
		rowId: id,
		data: { ...data, updatedAt: new Date().toISOString() },
		transactionId,
	});
}
export async function transaction<T>(
	run: (db: TablesDB, transactionId: string) => Promise<T>,
) {
	const db = mediaDB(true),
		tx = await db.createTransaction({ ttl: 60 });
	try {
		const value = await run(db, tx.$id);
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return value;
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
export function uploadDTO(
	a: Models.DefaultRow,
	parts: UploadAsset["parts"] = [],
): UploadAsset {
	return {
		id: a.$id,
		kind: a.kind,
		state: a.state,
		byteSize: a.byteSize,
		sha256: a.sha256,
		partBytes: 5 * 1024 ** 2,
		parts,
	};
}
export async function claim(
	id: string,
	ownerId: string,
	target: string,
	allowed: string[],
) {
	return transaction(async (db, tx) => {
		const a = await row(db, assetTable, id, tx);
		assertOwner(a, ownerId);
		if (
			!allowed.includes(a.state) ||
			(a.leaseUntil && Date.parse(a.leaseUntil) > Date.now())
		)
			throw new AuthFailure("forbidden");
		const token = crypto.randomUUID();
		await patch(
			db,
			id,
			{
				state: target,
				leaseUntil: new Date(Date.now() + 600_000).toISOString(),
				metadataJson: JSON.stringify({ operationToken: token }),
			},
			tx,
		);
		return { asset: a, token };
	});
}
export async function fencedPatch(
	id: string,
	ownerId: string,
	expectedState: string,
	token: string,
	data: Record<string, unknown>,
) {
	return transaction(async (db, tx) => {
		const a = await row(db, assetTable, id, tx);
		assertOwner(a, ownerId);
		if (
			!acceptsOperationResult(
				{
					state: a.state,
					leaseUntil: a.leaseUntil,
					metadataJson: a.metadataJson,
				},
				expectedState,
				token,
				Date.now(),
			)
		)
			throw new AuthFailure("forbidden");
		return patch(db, id, data, tx);
	});
}
