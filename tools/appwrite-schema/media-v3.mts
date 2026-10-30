import assert from "node:assert/strict";
import { Query, type TablesDB, TablesDBIndexType } from "node-appwrite";
import {
	mediaV3Digest,
	mediaV3Tables,
	mediaV3Version,
} from "./media-v3-contract.mts";
import { codeOf, waitFor } from "./provision.mts";
import { schemaDigest, schemaVersion } from "./schema.mts";

async function optional<T>(read: () => Promise<T>) {
	try {
		return await read();
	} catch (e) {
		if (codeOf(e) !== 404) throw e;
	}
}
export async function provisionMediaV3(db: TablesDB, databaseId: string) {
	assert.equal(
		(
			await db.getRow({
				databaseId,
				tableId: "schema_versions",
				rowId: schemaVersion,
			})
		).digest,
		schemaDigest,
	);
	const marker = {
		databaseId,
		tableId: "schema_versions",
		rowId: mediaV3Version,
	};
	const applied = await optional(() => db.getRow(marker));
	if (applied) assert.equal(applied.digest, mediaV3Digest);
	for (const [tableId, table] of Object.entries(mediaV3Tables)) {
		const ref = { databaseId, tableId };
		let actual = await optional(() => db.getTable(ref));
		if (!actual) {
			assert(!applied, "Applied media table missing");
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
			assert(table.columns[c.key], "Unexpected v3 column");
		for (const [key, c] of Object.entries(table.columns)) {
			const col = { ...ref, key };
			if (!(await optional(() => db.getColumn(col)))) {
				assert(!applied, "Applied media column missing");
				const args = { ...col, required: c.required };
				if (c.type === "string")
					await db.createStringColumn({ ...args, size: c.size ?? 255 });
				else if (c.type === "integer") await db.createIntegerColumn(args);
				else if (c.type === "datetime") await db.createDatetimeColumn(args);
				else throw new Error("Unsupported media column");
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
				assert(!applied, "Applied media index missing");
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
	if (!applied)
		await db.createRow({
			...marker,
			data: { digest: mediaV3Digest, appliedAt: new Date().toISOString() },
			permissions: [],
		});
	return { version: mediaV3Version, digest: mediaV3Digest };
}
