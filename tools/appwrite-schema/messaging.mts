// Additive messaging namespace; leaves applied v1/v2 and media-v3 digests untouched.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	type Models,
	Permission,
	Query,
	Role,
	type TablesDB,
	TablesDBIndexType,
} from "node-appwrite";
import { codeOf, waitFor } from "./provision.mts";
import { schemaDigest, schemaVersion } from "./schema.mts";
export const messagingVersion = "messaging-v1";
export const messagingDefinition = {
	message_conversations: {
		columns: {
			participantA: { type: "string", size: 36 },
			participantB: { type: "string", size: 36 },
			latestId: { type: "string", size: 36 },
			latestAt: { type: "datetime" },
		},
		indexes: [
			{ key: "participant_a_latest", columns: ["participantA", "latestAt"] },
			{ key: "participant_b_latest", columns: ["participantB", "latestAt"] },
			{ key: "latest", columns: ["latestAt"] },
		],
	},
	message_limits: {
		columns: {
			senderId: { type: "string", size: 36 },
			window: { type: "integer" },
			count: { type: "integer" },
		},
		indexes: [{ key: "quota_window", columns: ["window"] }],
	},
} as const;
export const messagingDigest = createHash("sha256")
	.update(JSON.stringify(messagingDefinition))
	.digest("hex");
async function optional<T>(read: () => Promise<T>) {
	try {
		return await read();
	} catch (e) {
		if (codeOf(e) !== 404) throw e;
	}
}
export async function provisionMessaging(db: TablesDB, databaseId: string) {
	const baseline = await db.getRow({
		databaseId,
		tableId: "schema_versions",
		rowId: schemaVersion,
	});
	assert.equal(baseline.digest, schemaDigest, "Messaging baseline differs");
	const marker = {
		databaseId,
		tableId: "schema_versions",
		rowId: messagingVersion,
	};
	const applied = await optional(() => db.getRow(marker));
	if (applied)
		assert.equal(
			applied.digest,
			messagingDigest,
			"Applied messaging digest differs",
		);
	for (const [tableId, definition] of Object.entries(messagingDefinition)) {
		const ref = { databaseId, tableId };
		let table = await optional(() => db.getTable(ref));
		if (!table) {
			assert.ok(!applied, "Applied messaging table missing");
			table = await db.createTable({
				...ref,
				name: tableId,
				permissions: [],
				rowSecurity: true,
			});
		}
		assert.deepEqual(table.$permissions, []);
		assert.equal(table.rowSecurity, true);
		assert.equal(table.enabled, true);
		const columns = await db.listColumns({
			...ref,
			queries: [Query.limit(100)],
		});
		assert.ok(columns.total <= 100, "Too many messaging columns");
		for (const actual of columns.columns)
			assert.ok(
				actual.key in definition.columns,
				"Unexpected messaging column",
			);
		for (const [key, column] of Object.entries(definition.columns)) {
			const col = { ...ref, key };
			if (!columns.columns.some((c) => c.key === key)) {
				assert.ok(!applied, "Applied messaging column missing");
				if (column.type === "string")
					await db.createStringColumn({
						...col,
						required: true,
						size: "size" in column ? column.size : 36,
					});
				else if (column.type === "datetime")
					await db.createDatetimeColumn({ ...col, required: true });
				else await db.createIntegerColumn({ ...col, required: true, min: 0 });
			}
			await waitFor(async () => (await db.getColumn(col)).status);
			const actual = await db.getColumn(col);
			assert.equal(actual.type, column.type);
			assert.equal(actual.required, true);
			assert.equal(actual.array, false);
			if ("size" in column)
				assert.equal((actual as unknown as { size: number }).size, column.size);
		}
		const indexes = await db.listIndexes({
			...ref,
			queries: [Query.limit(100)],
		});
		for (const index of indexes.indexes)
			assert.ok(
				definition.indexes.some((i) => i.key === index.key),
				"Unexpected messaging index",
			);
		for (const index of definition.indexes) {
			if (!indexes.indexes.some((i) => i.key === index.key)) {
				assert.ok(!applied, "Applied messaging index missing");
				await db.createIndex({
					...ref,
					key: index.key,
					columns: [...index.columns],
					type: TablesDBIndexType.Key,
				});
			}
			await waitFor(
				async () => (await db.getIndex({ ...ref, key: index.key })).status,
			);
			const actual = await db.getIndex({ ...ref, key: index.key });
			assert.equal(actual.type, "key");
			assert.deepEqual(actual.columns, [...index.columns]);
		}
	}
	if (!applied)
		await db.createRow({
			...marker,
			data: { digest: messagingDigest, appliedAt: new Date().toISOString() },
			permissions: [],
		});
	return { version: messagingVersion, digest: messagingDigest };
}
// Explicit offline import projection. Invoke only against authorized isolated/import datasets,
// after messages + their participant ACLs are loaded; no message/date mutation occurs here.
export async function indexImportedConversations(
	db: TablesDB,
	databaseId: string,
) {
	let cursor: string | undefined;
	const latest = new Map<string, Models.DefaultRow>();
	while (true) {
		const result = await db.listRows({
			databaseId,
			tableId: "messages",
			queries: [
				Query.orderAsc("$id"),
				Query.limit(100),
				...(cursor ? [Query.cursorAfter(cursor)] : []),
			],
			total: false,
		});
		for (const row of result.rows) {
			const pair = [String(row.fromUserId), String(row.toUserId)].sort();
			const id = createHash("sha256")
				.update(JSON.stringify(["conversation", ...pair]))
				.digest("hex")
				.slice(0, 36);
			const before = latest.get(id);
			if (
				!before ||
				Date.parse(row.createdAt) > Date.parse(before.createdAt) ||
				(Date.parse(row.createdAt) === Date.parse(before.createdAt) &&
					row.$id > before.$id)
			)
				latest.set(id, row);
		}
		if (result.rows.length < 100) break;
		cursor = result.rows.at(-1)?.$id;
	}
	for (const [rowId, row] of latest) {
		const [participantA, participantB] = [
			String(row.fromUserId),
			String(row.toUserId),
		].sort();
		await db.upsertRow({
			databaseId,
			tableId: "message_conversations",
			rowId,
			data: {
				participantA,
				participantB,
				latestId: row.$id,
				latestAt: row.createdAt,
			},
			permissions: [
				Permission.read(Role.user(String(participantA))),
				Permission.read(Role.user(String(participantB))),
			],
		});
	}
	return { conversations: latest.size };
}
