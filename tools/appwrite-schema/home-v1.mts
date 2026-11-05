// Additive. Applied v1 and later manifests and digests are intentionally unchanged.
import assert from "node:assert/strict";
import { Query, type TablesDB, TablesDBIndexType } from "node-appwrite";
import {
	homeV1Columns,
	homeV1Digest,
	homeV1Tables,
	homeV1Version,
} from "./home-v1-contract.mts";
import { profileV2Digest, profileV2Version } from "./profile-v2-contract.mts";
import { codeOf, waitFor } from "./provision.mts";
import type { Column, Index } from "./schema.mts";

export {
	homeV1Columns,
	homeV1Digest,
	homeV1Tables,
	homeV1Version,
} from "./home-v1-contract.mts";

async function optional<T>(read: () => Promise<T>) {
	try {
		return await read();
	} catch (e) {
		if (codeOf(e) !== 404) throw e;
	}
}
async function createColumn(
	db: TablesDB,
	args: { databaseId: string; tableId: string; key: string; required: boolean },
	c: Column,
) {
	if (c.type === "string")
		await db.createStringColumn({ ...args, size: c.size ?? 255 });
	else if (c.type === "integer") await db.createIntegerColumn(args);
	else if (c.type === "datetime") await db.createDatetimeColumn(args);
	else throw new Error("Unsupported home-v1 column");
}
async function ensureColumns(
	db: TablesDB,
	ref: { databaseId: string; tableId: string },
	columns: Record<string, Column>,
	applied: boolean,
) {
	for (const [key, c] of Object.entries(columns)) {
		const col = { ...ref, key };
		if (!(await optional(() => db.getColumn(col)))) {
			assert(!applied, "Applied home-v1 column missing");
			await createColumn(db, { ...col, required: c.required }, c);
		}
		await waitFor(async () => (await db.getColumn(col)).status);
		const a = (await db.getColumn(col)) as unknown as Record<string, unknown>;
		assert.equal(a.type, c.type, "home-v1 column type drift");
		assert.equal(a.required, c.required, "home-v1 nullability drift");
		assert.equal(a.array, false, "home-v1 array drift");
		assert.ok(a.default === null || a.default === undefined);
		if (c.size) assert.equal(a.size, c.size, "home-v1 size drift");
	}
}
async function ensureIndexes(
	db: TablesDB,
	ref: { databaseId: string; tableId: string },
	indexes: Index[],
	applied: boolean,
) {
	for (const i of indexes) {
		const index = { ...ref, key: i.key };
		if (!(await optional(() => db.getIndex(index)))) {
			assert(!applied, "Applied home-v1 index missing");
			await db.createIndex({
				...index,
				columns: i.columns,
				type:
					i.type === "unique"
						? TablesDBIndexType.Unique
						: TablesDBIndexType.Key,
			});
		}
		await waitFor(async () => (await db.getIndex(index)).status);
		const a = await db.getIndex(index);
		assert.equal(a.type, i.type);
		assert.deepEqual(a.columns, i.columns, "home-v1 index drift");
	}
}
export async function provisionHomeV1(db: TablesDB, databaseId: string) {
	assert.equal(
		(
			await db.getRow({
				databaseId,
				tableId: "schema_versions",
				rowId: profileV2Version,
			})
		).digest,
		profileV2Digest,
		"profile-v2 prerequisite differs",
	);
	const marker = {
		databaseId,
		tableId: "schema_versions",
		rowId: homeV1Version,
	};
	const applied = await optional(() => db.getRow(marker));
	if (applied)
		assert.equal(applied.digest, homeV1Digest, "home-v1 digest differs");
	for (const [tableId, extension] of Object.entries(homeV1Columns)) {
		const ref = { databaseId, tableId };
		const table = await db.getTable(ref);
		assert.deepEqual(table.$permissions, [], `Unsafe table ACL: ${tableId}`);
		assert.equal(table.rowSecurity, true, `Row security drift: ${tableId}`);
		await ensureColumns(db, ref, extension.columns, !!applied);
		await ensureIndexes(db, ref, extension.indexes, !!applied);
	}
	for (const [tableId, table] of Object.entries(homeV1Tables)) {
		const ref = { databaseId, tableId };
		let actual = await optional(() => db.getTable(ref));
		if (!actual) {
			assert(!applied, "Applied home-v1 table missing");
			actual = await db.createTable({
				...ref,
				name: tableId,
				rowSecurity: true,
				permissions: [],
			});
		}
		assert.deepEqual(actual.$permissions, []);
		assert.equal(actual.rowSecurity, true);
		const columns = await db.listColumns({
			...ref,
			queries: [Query.limit(100)],
		});
		for (const c of columns.columns)
			assert(table.columns[c.key], "Unexpected home-v1 column");
		await ensureColumns(db, ref, table.columns, !!applied);
		await ensureIndexes(db, ref, table.indexes, !!applied);
	}
	if (!applied)
		await db.createRow({
			...marker,
			data: { digest: homeV1Digest, appliedAt: new Date().toISOString() },
			permissions: [],
		});
	return { version: homeV1Version, digest: homeV1Digest };
}
