import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { Account, Client, Query, TablesDB, Users } from "node-appwrite";
import { permissions } from "./acl.mts";
import { fixtures, ids, post, profile, times, timestamp } from "./fixtures.mts";
import { endpoint } from "./local.mts";
import { publicProfile } from "./mapping.mts";
import { codeOf, localAdmin, provision, safeError } from "./provision.mts";
import { schemaDigest, tables } from "./schema.mts";

const results: Record<string, { status: string; detail?: unknown }> = {};
let stage = "bootstrap";
async function check(name: string, run: () => Promise<unknown>) {
	stage = name;
	try {
		results[name] = { status: "passed", detail: await run() };
	} catch (error) {
		results[name] = { status: "failed", detail: safeError(error) };
		throw error;
	}
	process.stdout.write(`${name}: passed\n`);
}
async function rejects(run: () => Promise<unknown>, codes: number[]) {
	try {
		await run();
	} catch (error) {
		assert.ok(codes.includes(codeOf(error) ?? 0));
		return;
	}
	throw new Error("Expected rejection");
}
async function main() {
	const { db, client, credentials } = await localAdmin();
	const databaseId = `proof-${crypto.randomUUID().slice(0, 8)}`;
	const users = new Users(client);
	const createdUsers: string[] = [];
	const ref = (tableId: string) => ({ databaseId, tableId });
	const create = (
		tableId: string,
		rowId: string,
		data: Record<string, unknown>,
	) =>
		db.createRow({
			...ref(tableId),
			rowId,
			data,
			permissions: permissions(tableId, data, rowId),
		});
	const actors: Record<string, TablesDB> = {
		anonymous: new TablesDB(
			new Client().setEndpoint(endpoint).setProject(credentials.project),
		),
	};
	const actorClients: Client[] = [];
	try {
		await check("provision-v1", () => provision(db, databaseId));
		await check("real-session-actors", async () => {
			for (const [actor, userId] of Object.entries(ids)) {
				const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
				const email = `${userId}@example.test`;
				await users.create({ userId, email, password });
				createdUsers.push(userId);
				if (actor === "admin")
					await users.updateLabels({ userId, labels: ["admin"] });
				// Client email-login omits secret by design. Issue a session server-side,
				// then discard the API key completely for identity and ACL assertions.
				const session = await users.createSession({ userId });
				assert.ok(session.secret);
				const sessionClient = new Client()
					.setEndpoint(endpoint)
					.setProject(credentials.project)
					.setSession(session.secret);
				assert.equal((await new Account(sessionClient).get()).$id, userId);
				actorClients.push(sessionClient);
				actors[actor] = new TablesDB(sessionClient);
			}
			return {
				actors: ["anonymous", "a", "b", "admin"],
				admin: "server-issued label, session client without API key",
			};
		});
		await check("reference-fixtures", async () => {
			for (const fixture of fixtures)
				await create(fixture.table, fixture.id, fixture.data);
			const row = await db.getRow({ ...ref("posts"), rowId: "post-0" });
			assert.equal(row.$id, "post-0");
			assert.equal(row.slug, "fixture-post-0");
			assert.equal(row.type, null);
			assert.equal(row.expiresAt, null);
			assert.equal(new Date(row.createdAt).toISOString(), timestamp);
			const a = await db.getRow({ ...ref("profiles"), rowId: ids.a });
			assert.deepEqual(a.position, ["STRIKER", "LEFT_WINGER"]);
			assert.deepEqual(a.foot, ["RIGHT"]);
			assert.equal(a.updatedAt, null);
			assert.ok(!("email" in publicProfile(a)));
			await rejects(
				() =>
					create("posts", "bad-enum", {
						...post("bad-enum"),
						status: "public",
					}),
				[400],
			);
			return {
				records: fixtures.length,
				preserved: ["id", "slug", "null", "enum-array", "millisecond-date"],
			};
		});
		await check("acl-get-and-list-matrix", async () => {
			const matrix: Record<string, Record<string, boolean>> = {};
			for (const fixture of fixtures) {
				const key = `${fixture.table}/${fixture.id}`;
				// Expected independently of the ACL implementation.
				const allowed: string[] =
					fixture.table === "profiles" ||
					fixture.table === "follows" ||
					(fixture.table === "posts" && fixture.id === "post-0")
						? ["anonymous", "a", "b", "admin"]
						: fixture.table === "posts" ||
								fixture.table === "private_profiles" ||
								fixture.table === "media"
							? ["a", "admin"]
							: fixture.table === "favorites" ||
									fixture.table === "notifications"
								? ["a"]
								: fixture.table === "messages"
									? fixture.id === "message-ab"
										? ["a", "b"]
										: ["admin"]
									: fixture.table === "signals" ||
											fixture.table === "post_private"
										? ["admin"]
										: [];
				matrix[key] = {};
				for (const [actor, actorDb] of Object.entries(actors)) {
					const visible = allowed.includes(actor);
					if (visible)
						assert.equal(
							(
								await actorDb.getRow({
									...ref(fixture.table),
									rowId: fixture.id,
								})
							).$id,
							fixture.id,
						);
					else
						await rejects(
							() =>
								actorDb.getRow({ ...ref(fixture.table), rowId: fixture.id }),
							[401, 404],
						);
					const list = await actorDb.listRows({
						...ref(fixture.table),
						queries: [Query.equal("$id", fixture.id)],
						total: true,
					});
					assert.equal(list.total, visible ? 1 : 0);
					assert.equal(list.rows.length, visible ? 1 : 0);
					matrix[key][actor] = visible;
				}
			}
			return matrix;
		});
		await check("client-writes-and-role-escalation-denied", async () => {
			const forgedStatus: Record<string, unknown> = { status: "DRAFT" };
			const forgedRole: Record<string, unknown> = { role: "ADMIN" };
			for (const actorDb of Object.values(actors)) {
				await rejects(
					() =>
						actorDb.createRow({
							...ref("posts"),
							rowId: "forged",
							data: post("forged"),
							permissions: ['read("any")'],
						}),
					[401],
				);
				await rejects(
					() =>
						actorDb.updateRow({
							...ref("posts"),
							rowId: "post-0",
							permissions: ['read("any")', 'update("any")'],
						}),
					[401],
				);
				await rejects(
					() =>
						actorDb.updateRow({
							...ref("posts"),
							rowId: "post-0",
							data: forgedStatus,
							permissions: ['read("any")'],
						}),
					[401],
				);
				await rejects(
					() => actorDb.deleteRow({ ...ref("posts"), rowId: "post-0" }),
					[401],
				);
				await rejects(
					() =>
						actorDb.updateRow({
							...ref("private_profiles"),
							rowId: ids.a,
							data: forgedRole,
						}),
					[401],
				);
			}
			for (const sessionClient of actorClients)
				await rejects(
					() =>
						new Users(sessionClient).updateLabels({
							userId: ids.a,
							labels: ["admin"],
						}),
					[401],
				);
			const unchanged = await db.getRow({ ...ref("posts"), rowId: "post-0" });
			assert.equal(unchanged.status, "PUBLISHED");
			assert.deepEqual(unchanged.$permissions, ['read("any")']);
			return {
				noDirectClientMutations: true,
				adminIsReadOnlyWithoutServer: true,
			};
		});
		await check("unique-collisions-and-null-names", async () => {
			await rejects(
				() => create("profiles", "duplicate-name", profile("fixture-a")),
				[409],
			);
			await rejects(
				() => create("posts", "duplicate-slug", post("fixture-post-0")),
				[409],
			);
			for (const table of ["follows", "likes", "favorites", "signals"]) {
				const fixture = fixtures.find((f) => f.table === table);
				assert.ok(fixture);
				await rejects(
					() => create(table, `duplicate-${table}`, fixture.data),
					[409],
				);
			}
			await create("profiles", "null-name-1", profile(null));
			await create("profiles", "null-name-2", profile(null));
			return {
				rejected: [
					"name",
					"slug",
					"follow-pair",
					"like-pair",
					"favorite-pair",
					"signal-pair",
				],
				nullableNames: 2,
			};
		});
		await check("concurrent-unique-writes", async () => {
			const winners: Record<string, number> = {};
			for (const table of [
				"profiles",
				"posts",
				"follows",
				"likes",
				"favorites",
				"signals",
			]) {
				const data =
					table === "profiles"
						? profile("race-name")
						: table === "posts"
							? post("race-slug")
							: table === "follows"
								? { followerId: ids.b, followingId: ids.a, ...times }
								: {
										userId: ids.b,
										postId: "post-0",
										...times,
										...(table === "signals"
											? { reason: "OTHER", details: null, status: "PENDING" }
											: {}),
									};
				const attempts = await Promise.allSettled(
					Array.from({ length: 8 }, (_, i) =>
						create(table, `race-${table}-${i}`, data),
					),
				);
				assert.equal(
					attempts.filter((r) => r.status === "fulfilled").length,
					1,
				);
				for (const result of attempts)
					if (result.status === "rejected")
						assert.equal(codeOf(result.reason), 409);
				winners[table] = 1;
			}
			return { parallelWritersPerConstraint: 8, winners };
		});
		await check("indexed-queries-counts-and-batching", async () => {
			const search = await db.listRows({
				...ref("profiles"),
				queries: [Query.equal("nameFolded", "fixture-a")],
			});
			assert.equal(search.total, 1);
			const posts = await db.listRows({
				...ref("posts"),
				queries: [
					Query.equal("status", "PUBLISHED"),
					Query.orderDesc("publishedAt"),
					Query.limit(100),
				],
			});
			assert.equal(posts.total, 2);
			const postIds = posts.rows.map((p) => p.$id);
			const likes = await db.listRows({
				...ref("likes"),
				queries: [Query.equal("postId", postIds)],
				total: true,
			});
			assert.equal(likes.total, 2);
			const comments = await db.listRows({
				...ref("comments"),
				queries: [Query.equal("postId", postIds)],
				total: true,
			});
			assert.equal(comments.total, 1);
			const unread = await db.listRows({
				...ref("notifications"),
				queries: [Query.equal("userId", ids.a), Query.isNull("readAt")],
				total: true,
			});
			assert.equal(unread.total, 1);
			const conversation = await db.listRows({
				...ref("messages"),
				queries: [
					Query.equal("fromUserId", ids.a),
					Query.equal("toUserId", ids.b),
					Query.orderDesc("createdAt"),
				],
			});
			assert.equal(conversation.total, 1);
			return {
				postPage: 2,
				likes: 2,
				comments: 1,
				unread: 1,
				conversation: 1,
				strategy: "page + batched IN references; exact totals from source rows",
			};
		});
		await check("moderation-atomic-acl-commit-and-rollback", async () => {
			const tx = await db.createTransaction({ ttl: 60 });
			await db.updateRow({
				...ref("posts"),
				rowId: "post-0",
				data: { status: "REJECTED" },
				permissions: permissions(
					"posts",
					{ status: "REJECTED", userId: ids.a },
					"post-0",
				),
				transactionId: tx.$id,
			});
			await db.updateRow({
				...ref("signals"),
				rowId: "signal-a",
				data: { status: "REVIEWED" },
				transactionId: tx.$id,
			});
			assert.equal(
				(await db.getRow({ ...ref("posts"), rowId: "post-0" })).status,
				"PUBLISHED",
			);
			await db.updateTransaction({ transactionId: tx.$id, commit: true });
			assert.equal(
				(await db.getRow({ ...ref("signals"), rowId: "signal-a" })).status,
				"REVIEWED",
			);
			assert.ok(actors.anonymous && actors.b && actors.a && actors.admin);
			const anonymous = actors.anonymous;
			for (const actor of [actors.anonymous, actors.b])
				await rejects(
					() => actor.getRow({ ...ref("posts"), rowId: "post-0" }),
					[401, 404],
				);
			for (const actor of [actors.a, actors.admin])
				assert.equal(
					(await actor.getRow({ ...ref("posts"), rowId: "post-0" })).status,
					"REJECTED",
				);
			const rollback = await db.createTransaction({ ttl: 60 });
			await db.updateRow({
				...ref("posts"),
				rowId: "post-0",
				data: { status: "PUBLISHED" },
				permissions: permissions("posts", { status: "PUBLISHED" }, "post-0"),
				transactionId: rollback.$id,
			});
			await db.updateTransaction({
				transactionId: rollback.$id,
				rollback: true,
			});
			assert.equal(
				(await db.getRow({ ...ref("posts"), rowId: "post-0" })).status,
				"REJECTED",
			);
			await rejects(
				() => anonymous.getRow({ ...ref("posts"), rowId: "post-0" }),
				[401, 404],
			);
			return { statusAndAclAtomic: true, rollbackRetainsAcl: true };
		});
		await check("concurrent-transaction-conflict", async () => {
			const first = await db.createTransaction({ ttl: 60 });
			const second = await db.createTransaction({ ttl: 60 });
			for (const tx of [first, second])
				await db.updateRow({
					...ref("comments"),
					rowId: "comment-a",
					data: { content: tx.$id },
					transactionId: tx.$id,
				});
			await db.updateTransaction({ transactionId: first.$id, commit: true });
			await rejects(
				() => db.updateTransaction({ transactionId: second.$id, commit: true }),
				[409],
			);
			assert.equal(
				(await db.getRow({ ...ref("comments"), rowId: "comment-a" })).content,
				first.$id,
			);
			return { committed: 1, conflicts: 1 };
		});
		await check("rerun-preserves-all-records-and-acls", async () => {
			const snapshot = async () => {
				const data: Record<string, unknown> = {};
				for (const tableId of Object.keys(tables)) {
					const rows = await db.listRows({
						...ref(tableId),
						queries: [Query.limit(100), Query.orderAsc("$id")],
						total: true,
					});
					assert.ok(rows.total < 100);
					data[tableId] = rows.rows;
				}
				return data;
			};
			const before = await snapshot();
			await provision(db, databaseId);
			await provision(db, databaseId);
			assert.deepEqual(await snapshot(), before);
			const versions = await db.listRows(ref("schema_versions"));
			assert.equal(versions.total, 1);
			return { additionalRuns: 2, allTablesAndPermissionsUnchanged: true };
		});
		await check("schema-drift-fails-closed", async () => {
			await db.updateTable({
				...ref("favorites"),
				name: "favorites",
				permissions: ['read("any")'],
				rowSecurity: true,
			});
			try {
				await assert.rejects(
					() => provision(db, databaseId),
					/Unsafe table ACL/,
				);
			} finally {
				await db.updateTable({
					...ref("favorites"),
					name: "favorites",
					permissions: [],
					rowSecurity: true,
				});
			}
			await provision(db, databaseId);
			return { unsafeTableGrantRejected: true };
		});
	} finally {
		// Task-owned synthetic users only; dedicated Docker teardown destroys the proof DB.
		for (const userId of createdUsers) await users.delete({ userId });
	}
	return { databaseId };
}
let runtime: unknown;
try {
	runtime = await main();
} catch (error) {
	results[stage] ??= { status: "failed", detail: safeError(error) };
	process.stderr.write(`${stage}: ${JSON.stringify(safeError(error))}\n`);
	process.exitCode = 1;
}
await mkdir(new URL("evidence", import.meta.url), { recursive: true });
await Bun.write(
	new URL("evidence/appwrite-2.6.2.json", import.meta.url),
	`${JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			serverVersion: "2.6.2",
			localOnly: true,
			permanentHostGate: "#46 pending",
			schemaDigest,
			runtime,
			results,
		},
		null,
		"\t",
	)}\n`,
);
