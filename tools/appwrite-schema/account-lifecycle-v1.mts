import assert from "node:assert/strict";
import { Query, type TablesDB, TablesDBIndexType } from "node-appwrite";
import {
	accountLifecycleDigest,
	accountLifecycleIndexes,
	accountLifecycleTables,
	accountLifecycleVersion,
} from "./account-lifecycle-v1-contract.mts";
import { mediaV3Digest, mediaV3Version } from "./media-v3-contract.mts";
import { codeOf, waitFor } from "./provision.mts";

async function optional<T>(read: () => Promise<T>) {
	try {
		return await read();
	} catch (e) {
		if (codeOf(e) !== 404) throw e;
	}
}
export async function provisionAccountLifecycleV1(
	db: TablesDB,
	databaseId: string,
) {
	assert.equal(
		(
			await db.getRow({
				databaseId,
				tableId: "schema_versions",
				rowId: mediaV3Version,
			})
		).digest,
		mediaV3Digest,
	);
	const marker = {
		databaseId,
		tableId: "schema_versions",
		rowId: accountLifecycleVersion,
	};
	const applied = await optional(() => db.getRow(marker));
	if (applied) assert.equal(applied.digest, accountLifecycleDigest);
	for (const [tableId, table] of Object.entries(accountLifecycleTables)) {
		const ref = { databaseId, tableId };
		let actual = await optional(() => db.getTable(ref));
		if (!actual) {
			assert(!applied, "Applied account lifecycle table missing");
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
			assert(table.columns[c.key], "Unexpected account lifecycle column");
		for (const [key, c] of Object.entries(table.columns)) {
			const col = { ...ref, key };
			if (!(await optional(() => db.getColumn(col)))) {
				assert(!applied, "Applied account lifecycle column missing");
				const args = { ...col, required: c.required };
				if (c.type === "string")
					await db.createStringColumn({ ...args, size: c.size ?? 255 });
				else if (c.type === "integer") await db.createIntegerColumn(args);
				else if (c.type === "datetime") await db.createDatetimeColumn(args);
				else throw new Error("Unsupported account lifecycle column");
			}
			await waitFor(async () => (await db.getColumn(col)).status);
			const a = await db.getColumn(col);
			assert.equal(a.type, c.type);
			assert.equal(a.required, c.required);
			assert.equal(a.array, false);
			if (c.size) assert.equal((a as unknown as { size: number }).size, c.size);
		}
		for (const i of table.indexes) {
			const index = { ...ref, key: i.key };
			if (!(await optional(() => db.getIndex(index)))) {
				assert(!applied, "Applied account lifecycle index missing");
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
			assert.deepEqual(a.columns, i.columns);
		}
	}
	for (const [tableId, indexes] of Object.entries(accountLifecycleIndexes)) {
		for (const item of indexes) {
			const ref = { databaseId, tableId, key: item.key };
			if (!(await optional(() => db.getIndex(ref)))) {
				assert(!applied, "Applied account index missing");
				await db.createIndex({
					...ref,
					columns: item.columns,
					type: TablesDBIndexType.Key,
				});
			}
			await waitFor(async () => (await db.getIndex(ref)).status);
			const actual = await db.getIndex(ref);
			assert.equal(actual.type, "key");
			assert.deepEqual(actual.columns, item.columns);
		}
	}
	if (!applied)
		await db.createRow({
			...marker,
			data: {
				digest: accountLifecycleDigest,
				appliedAt: new Date().toISOString(),
			},
			permissions: [],
		});
	return { version: accountLifecycleVersion, digest: accountLifecycleDigest };
}
