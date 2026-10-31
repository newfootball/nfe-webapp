// Additive version; existing applied schema digests are unchanged.
import assert from "node:assert/strict";
import { Query, type TablesDB, TablesDBIndexType } from "node-appwrite";
import {
	notificationV1Digest as schemaDigest,
	notificationV1Version as schemaVersion,
	notificationV1Tables as tables,
} from "./notification-v1-contract.mts";
import {
	schemaDigest as baselineDigest,
	schemaVersion as baselineVersion,
	type Column,
} from "./schema.mts";

export function safeError(error: unknown) {
	const e = error as { code?: number; type?: string; name?: string };
	return { code: e.code, type: e.type ?? e.name ?? "Error" };
}
export const codeOf = (error: unknown) => (error as { code?: number }).code;
export async function waitFor(read: () => Promise<string>) {
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		const status = await read();
		if (status === "available") return;
		if (status === "failed" || status === "stuck")
			throw new Error(`Schema operation ${status}`);
		await Bun.sleep(250);
	}
	throw new Error("Schema readiness timed out");
}
async function optional<T>(read: () => Promise<T>): Promise<T | undefined> {
	try {
		return await read();
	} catch (error) {
		if (codeOf(error) !== 404) throw error;
	}
}
function checkColumn(expected: Column, actual: object) {
	const a = actual as Record<string, unknown>;
	assert.equal(
		a.type,
		expected.type === "enum" ? "string" : expected.type,
		"Column type drift",
	);
	assert.equal(a.required, expected.required, "Column nullability drift");
	assert.equal(a.array, expected.array ?? false, "Column array drift");
	if (expected.size) assert.equal(a.size, expected.size, "Column size drift");
	if (expected.elements) {
		assert.equal(a.format, "enum");
		assert.deepEqual(a.elements, expected.elements, "Column enum drift");
	}
	assert.ok(
		a.default === null || a.default === undefined,
		"Unexpected default changes null contract",
	);
}
export async function provisionNotificationV1(
	db: TablesDB,
	databaseId: string,
) {
	const prerequisite = await db.getRow({
		databaseId,
		tableId: "schema_versions",
		rowId: baselineVersion,
	});
	assert.equal(
		prerequisite.digest,
		baselineDigest,
		"Baseline prerequisite drift",
	);

	const marker = {
		databaseId,
		tableId: "schema_versions",
		rowId: schemaVersion,
	};
	const applied = await optional(() => db.getRow(marker));
	if (applied)
		assert.equal(applied.digest, schemaDigest, "Applied version digest drift");
	// Never delete a table/column/index or modify records to reconcile drift.
	for (const [tableId, table] of Object.entries(tables)) {
		const ref = { databaseId, tableId };
		const existing = await optional(() => db.getTable(ref));
		if (!existing) {
			assert.ok(!applied, "Applied notification table missing");
			await db.createTable({
				...ref,
				name: tableId,
				permissions: [],
				rowSecurity: true,
			});
		} else {
			assert.deepEqual(
				existing.$permissions,
				[],
				`Unsafe table ACL: ${tableId}`,
			);
			assert.equal(
				existing.rowSecurity,
				true,
				`Row security drift: ${tableId}`,
			);
			assert.equal(existing.enabled, true);
		}
		const columns = await db.listColumns({
			...ref,
			queries: [Query.limit(100)],
		});
		assert.ok(columns.total <= 100, "Too many columns to inspect");
		for (const column of columns.columns)
			assert.ok(
				table.columns[column.key],
				`Unexpected column: ${tableId}.${column.key}`,
			);
		for (const [key, column] of Object.entries(table.columns)) {
			const found = columns.columns.find((c) => c.key === key);
			if (!found) {
				assert.ok(!applied, "Applied notification column missing");
				const args = {
					...ref,
					key,
					required: column.required,
					array: column.array ?? false,
				};
				switch (column.type) {
					case "string":
						await db.createStringColumn({ ...args, size: column.size ?? 255 });
						break;
					case "enum":
						await db.createEnumColumn({
							...args,
							elements: column.elements ?? [],
						});
						break;
					case "datetime":
						await db.createDatetimeColumn(args);
						break;
					case "integer":
						await db.createIntegerColumn(args);
						break;
					case "boolean":
						await db.createBooleanColumn(args);
						break;
				}
			}
			await waitFor(async () => (await db.getColumn({ ...ref, key })).status);
			checkColumn(column, await db.getColumn({ ...ref, key }));
		}
		const indexes = await db.listIndexes({
			...ref,
			queries: [Query.limit(100)],
		});
		assert.ok(indexes.total <= 100);
		for (const index of indexes.indexes)
			assert.ok(
				table.indexes.some((i) => i.key === index.key),
				`Unexpected index: ${index.key}`,
			);
		for (const index of table.indexes) {
			if (!indexes.indexes.some((i) => i.key === index.key)) {
				assert.ok(!applied, "Applied notification index missing");
				await db.createIndex({
					...ref,
					...index,
					type:
						index.type === "unique"
							? TablesDBIndexType.Unique
							: TablesDBIndexType.Key,
				});
			}
			await waitFor(
				async () => (await db.getIndex({ ...ref, key: index.key })).status,
			);
			const actual = await db.getIndex({ ...ref, key: index.key });
			assert.equal(actual.type, index.type);
			assert.deepEqual(actual.columns, index.columns, "Index definition drift");
		}
	}
	if (!applied)
		await db.createRow({
			...marker,
			data: { digest: schemaDigest, appliedAt: new Date().toISOString() },
			permissions: [],
		});
	return {
		version: schemaVersion,
		digest: schemaDigest,
		tables: Object.keys(tables).length,
	};
}
