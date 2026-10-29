import { Client, Query, TablesDB } from "node-appwrite";
import { bootstrap } from "./feed-bootstrap";
import { databaseId } from "./feed-capabilities";
import { endpoint } from "./feed-local";

const c = await bootstrap();
const db = new TablesDB(
	new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
);
for (let i = 0; i < 35; i++)
	await db.createRow({
		databaseId,
		tableId: "likes",
		rowId: `like-${i}`,
		data: {
			userId: `u-${i}`,
			postId: i < 31 ? "probe-040" : "probe-039",
			createdAt: "2026-01-15T12:34:56.123Z",
			updatedAt: "2026-01-15T12:34:56.123Z",
		},
		permissions: [],
	});
const results = [];
for (const [tableId, queries] of [
	[
		"likes",
		[
			Query.equal("postId", ["probe-040", "probe-039", "probe-038"]),
			Query.groupBy(["postId"]),
			Query.count("$id", "count"),
			Query.limit(20),
		],
	],
	[
		"posts",
		[
			Query.equal("status", "PUBLISHED"),
			Query.groupBy(["userId"]),
			Query.count("$id", "count"),
			Query.limit(20),
		],
	],
] as [string, string[]][]) {
	try {
		const r = await db.listRows({ databaseId, tableId, queries, total: false });
		results.push({ tableId, queries, ok: true, response: r });
	} catch (e) {
		const x = e as { code: number; type: string; message: string };
		results.push({
			tableId,
			queries,
			ok: false,
			code: x.code,
			type: x.type,
			message: x.message,
		});
	}
}
// Establish nullable date sort and seek against genuine null fixtures.
await db.updateRow({
	databaseId,
	tableId: "posts",
	rowId: "probe-040",
	data: { publishedAt: null },
});
for (const queries of [
	[
		Query.equal("status", "PUBLISHED"),
		Query.orderDesc("publishedAt"),
		Query.orderDesc("$id"),
		Query.limit(2),
	],
	[
		Query.equal("status", "PUBLISHED"),
		Query.isNull("publishedAt"),
		Query.lessThan("$id", "probe-041"),
		Query.orderDesc("$id"),
		Query.limit(2),
	],
	[
		Query.equal("status", "PUBLISHED"),
		Query.or([
			Query.lessThan("publishedAt", "2026-01-15T12:34:56.123Z"),
			Query.and([
				Query.equal("publishedAt", "2026-01-15T12:34:56.123Z"),
				Query.lessThan("$id", "probe-001"),
			]),
			Query.isNull("publishedAt"),
		]),
		Query.orderDesc("publishedAt"),
		Query.orderDesc("$id"),
		Query.limit(3),
	],
]) {
	try {
		const r = await db.listRows({
			databaseId,
			tableId: "posts",
			queries,
			total: false,
		});
		results.push({ tableId: "posts", queries, ok: true, response: r });
	} catch (e) {
		results.push({ ok: false, error: String(e) });
	}
}
const path = `${import.meta.dir}/../evidence/feed-capabilities.json`;
const evidence = await Bun.file(path).json();
evidence.exactGroupedAndNull = results;
await Bun.write(path, JSON.stringify(evidence, null, 2) + "\n");
console.log(results);
