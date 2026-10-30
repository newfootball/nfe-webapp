import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, Query, TablesDB } from "node-appwrite";
import { bootstrap } from "./feed-bootstrap";
import { endpoint } from "./feed-local";

export const databaseId = "feed-proof";
export async function setup() {
	const c = await bootstrap();
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const dir = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provision } = await import(`${dir}/provision.mts`);
	await provision(db, databaseId);
	return { c, db };
}
if (import.meta.main) {
	const { c, db } = await setup();
	const keyless = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project),
	);
	const { Permission, Role } = await import("node-appwrite");
	const timestamp = "2026-01-15T12:34:56.123Z";
	for (let i = 0; i < 41; i++)
		await db.createRow({
			databaseId,
			tableId: "posts",
			rowId: `probe-${String(i).padStart(3, "0")}`,
			permissions: [Permission.read(Role.any())],
			data: {
				slug: `probe-${i}`,
				userId: "probe-author",
				title: "Équipe Paris",
				titleFolded: "équipe paris",
				description: "Une démonstration",
				descriptionFolded: "une démonstration",
				type: null,
				status: "PUBLISHED",
				createdAt: timestamp,
				updatedAt: timestamp,
				publishedAt: timestamp,
				expiresAt: null,
				validatedAt: null,
			},
		});
	const results: object[] = [];
	async function probe(name: string, queries: string[]) {
		try {
			const r = await keyless.listRows({
				databaseId,
				tableId: "posts",
				queries,
			});
			results.push({
				name,
				queries,
				ok: true,
				ids: r.rows.map((x) => x.$id),
				total: r.total,
			});
			return r;
		} catch (e) {
			const error = e as { code: number; type: string; message: string };
			results.push({
				name,
				queries,
				ok: false,
				code: error.code,
				type: error.type,
				message: error.message,
			});
			return null;
		}
	}
	const order = [
		Query.equal("status", "PUBLISHED"),
		Query.orderDesc("createdAt"),
		Query.orderDesc("$id"),
		Query.limit(11),
	];
	const first = await probe("compound", order);
	if (first) {
		await probe("cursorAfter", [
			...order,
			Query.cursorAfter(first.rows[9]!.$id),
		]);
		await probe("seek", [
			...order,
			Query.or([
				Query.lessThan("createdAt", timestamp),
				Query.and([
					Query.equal("createdAt", timestamp),
					Query.lessThan("$id", first.rows[9]!.$id),
				]),
			]),
		]);
	}
	await probe("substring-union", [
		...order,
		Query.or([
			Query.contains("titleFolded", ["qui"]),
			Query.contains("descriptionFolded", ["monst"]),
		]),
	]);
	await probe("null-published", [
		Query.equal("status", "PUBLISHED"),
		Query.orderDesc("publishedAt"),
		Query.orderDesc("$id"),
		Query.limit(11),
	]);
	await probe("batch-id", [
		Query.equal(
			"$id",
			Array.from(
				{ length: 40 },
				(_, i) => `probe-${String(i).padStart(3, "0")}`,
			),
		),
		Query.limit(41),
		Query.select(["$id", "userId"]),
	]);
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/feed-capabilities.json`,
		JSON.stringify(
			{
				at: new Date().toISOString(),
				appwrite: "2.6.2",
				sdk: "31.1.0",
				source: "synthetic only",
				timestamp,
				rows: 41,
				results,
			},
			null,
			2,
		) + "\n",
	);
	assert.ok(first, "Compound ordering unsupported; inspect evidence");
	console.log(results);
}
