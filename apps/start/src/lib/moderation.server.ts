import "@tanstack/react-start/server-only";
import {
	AppwriteException,
	ID,
	type Models,
	Permission,
	Query,
	Role,
	TablesDB,
} from "node-appwrite";
import {
	AuthFailure,
	boundary,
	client,
	configuration,
	identity,
	mutation,
} from "./auth-context.server";
import type {
	AdminDashboard,
	AdminPage,
	ReportDTO,
} from "./moderation-contract";
import { spamScore } from "./moderation-contract";
import type {
	AdminPageInput,
	DecisionInput,
	ReportInput,
} from "./moderation-input";
import { moderationTransaction, sameRevision } from "./moderation-transaction";
import type { Validated } from "./profile-input";

const adminACL = [Permission.read(Role.label("admin"))];
function connection(write = false) {
	const c = configuration(),
		databaseId = process.env.START_APPWRITE_DATABASE;
	const reader = process.env.START_APPWRITE_MODERATION_READER_KEY,
		writer = process.env.START_APPWRITE_MODERATION_WRITER_KEY;
	const key = write ? writer : reader;
	if (!databaseId || !key || key === c.key || reader === writer)
		throw new AuthFailure("unavailable");
	return { databaseId, db: new TablesDB(client(c).setKey(key)) };
}
async function admin() {
	const { viewer } = await identity();
	if (viewer.role !== "admin") throw new AuthFailure("forbidden");
	return viewer;
}
const get = (tableId: string, rowId: string) => {
	const c = connection();
	return c.db.getRow({ databaseId: c.databaseId, tableId, rowId });
};
async function visible(postId: string) {
	const c = configuration(),
		databaseId = process.env.START_APPWRITE_DATABASE;
	if (!databaseId) throw new AuthFailure("unavailable");
	const db = new TablesDB(client(c));
	const p = await db.getRow({ databaseId, tableId: "posts", rowId: postId });
	if (p.status !== "PUBLISHED") throw new AuthFailure("forbidden");
	const owner = await db.getRow({
		databaseId,
		tableId: "profiles",
		rowId: String(p.userId),
		queries: [Query.select(["isOnboarded"])],
	});
	if (!owner.isOnboarded) throw new AuthFailure("forbidden");
	return p;
}
async function atomic<T>(
	run: (db: TablesDB, databaseId: string, transactionId: string) => Promise<T>,
) {
	const { db, databaseId } = connection(true);
	return moderationTransaction(
		{
			begin: async () => (await db.createTransaction({ ttl: 60 })).$id,
			commit: (transactionId) =>
				db.updateTransaction({ transactionId, commit: true }),
			rollback: (transactionId) =>
				db.updateTransaction({ transactionId, rollback: true }),
		},
		(transactionId) => run(db, databaseId, transactionId),
	);
}
async function anchor(
	db: TablesDB,
	databaseId: string,
	tx: string,
	p: Models.DefaultRow,
) {
	// No unrelated business fields/dates change. This shared parent write makes concurrent
	// interaction, lifecycle and moderation transactions contend at commit.
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: p.$id,
		data: { status: p.status },
		transactionId: tx,
	});
	const now = await get("posts", p.$id);
	if (!sameRevision(p, now)) throw new AuthFailure("forbidden");
}
export function createReport(input: Validated<ReportInput>) {
	return boundary(async () => {
		mutation();
		const { viewer } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const { postId, reason, details } = input.data,
			p = await visible(postId),
			c = connection();
		const existing = await c.db.listRows({
			databaseId: c.databaseId,
			tableId: "signals",
			queries: [
				Query.equal("postId", postId),
				Query.equal("userId", viewer.id),
				Query.limit(1),
				Query.select(["$id"]),
			],
			total: false,
		});
		if (existing.rows.length) return { created: false };
		await atomic(async (db, databaseId, tx) => {
			await anchor(db, databaseId, tx, p);
			const count = await c.db.listRows({
				databaseId,
				tableId: "signals",
				queries: [
					Query.equal("postId", postId),
					Query.limit(1),
					Query.select(["$id"]),
				],
				total: true,
			});
			const now = new Date().toISOString();
			await db.createRow({
				databaseId,
				tableId: "signals",
				rowId: ID.unique(),
				transactionId: tx,
				permissions: adminACL,
				data: {
					postId,
					userId: viewer.id,
					reason,
					details: details || null,
					status: "PENDING",
					createdAt: now,
					updatedAt: now,
				},
			});
			const score = spamScore(count.total + 1);
			// Legacy reporting never downgrades a preexisting score below the first threshold.
			if (score === "NONE") return;
			const previous = await c.db.listRows({
				databaseId,
				tableId: "post_private",
				queries: [Query.equal("$id", postId), Query.limit(1)],
				total: false,
			});
			if (previous.rows.length)
				await db.updateRow({
					databaseId,
					tableId: "post_private",
					rowId: postId,
					data: { spamScore: score },
					permissions: adminACL,
					transactionId: tx,
				});
			else
				await db.createRow({
					databaseId,
					tableId: "post_private",
					rowId: postId,
					data: { spamScore: score },
					permissions: adminACL,
					transactionId: tx,
				});
		});
		return { created: true };
	});
}
export function dashboard() {
	return boundary(async (): Promise<AdminDashboard> => {
		const viewer = await admin(),
			c = connection();
		const count = async (tableId: string, queries: string[] = []) =>
			(
				await c.db.listRows({
					databaseId: c.databaseId,
					tableId,
					queries: [...queries, Query.select(["$id"]), Query.limit(1)],
					total: true,
				})
			).total;
		const [users, posts, pending] = await Promise.all([
			count("profiles"),
			count("posts"),
			count("signals", [Query.equal("status", "PENDING")]),
		]);
		return { viewerId: viewer.id, users, posts, pending };
	});
}
export function listAdmin(input: Validated<AdminPageInput>) {
	return boundary(async (): Promise<AdminPage> => {
		const viewer = await admin();
		if (!input.valid) throw new AuthFailure("invalid");
		const { kind, q, status, cursor } = input.data,
			c = connection(),
			tableId = kind === "users" ? "profiles" : "signals";
		const queries = [
			Query.orderDesc("createdAt"),
			Query.orderDesc("$id"),
			Query.limit(21),
		];
		if (cursor) queries.push(Query.cursorAfter(cursor));
		if (kind === "reports") {
			queries.push(Query.equal("status", status));
			// Exact post/user ID search is bounded and uses existing accepted indexes.
			if (q) queries.push(Query.equal("postId", q));
			queries.push(
				Query.select([
					"$id",
					"$updatedAt",
					"postId",
					"userId",
					"reason",
					"details",
					"status",
					"createdAt",
				]),
			);
		} else {
			if (q)
				queries.push(
					Query.startsWith(
						"nameFolded",
						q.normalize("NFC").toLocaleLowerCase("fr"),
					),
				);
			queries.push(
				Query.select(["$id", "name", "userType", "isOnboarded", "createdAt"]),
			);
		}
		const r = await c.db.listRows({
				databaseId: c.databaseId,
				tableId,
				queries,
				total: false,
			}),
			rows = r.rows.slice(0, 20);
		const reports: ReportDTO[] =
			kind === "reports"
				? await Promise.all(
						rows.map(async (s) => {
							let p: Models.DefaultRow | null = null;
							try {
								p = await get("posts", String(s.postId));
							} catch (e) {
								if (!(e instanceof AppwriteException && e.code === 404))
									throw e;
							}
							return {
								id: s.$id,
								postId: String(s.postId),
								userId: String(s.userId),
								reason: s.reason,
								details: typeof s.details === "string" ? s.details : null,
								status: s.status,
								createdAt: String(s.createdAt),
								version: s.$updatedAt,
								post: p
									? {
											title: String(p.title),
											status: p.status ?? null,
											version: p.$updatedAt,
										}
									: null,
							};
						}),
					)
				: [];
		return {
			viewerId: viewer.id,
			reports,
			users:
				kind === "users"
					? rows.map((p) => ({
							id: p.$id,
							name: typeof p.name === "string" ? p.name : null,
							userType: String(p.userType),
							isOnboarded: p.isOnboarded === true,
							createdAt: String(p.createdAt),
						}))
					: [],
			nextCursor: r.rows.length > 20 ? rows[19]!.$id : null,
		};
	});
}
export function decideReport(input: Validated<DecisionInput>) {
	return boundary(async () => {
		mutation();
		await admin();
		if (!input.valid) throw new AuthFailure("invalid");
		const { signalId, postId, operation, postVersion, signalVersion } =
			input.data;
		const s = await get("signals", signalId),
			p = await get("posts", postId);
		if (
			s.postId !== p.$id ||
			s.status !== "PENDING" ||
			s.$updatedAt !== signalVersion ||
			p.$updatedAt !== postVersion
		)
			throw new AuthFailure("forbidden");
		await atomic(async (db, databaseId, transactionId) => {
			await anchor(db, databaseId, transactionId, p);
			await db.updateRow({
				databaseId,
				tableId: "signals",
				rowId: signalId,
				transactionId,
				data: { status: operation === "dismiss" ? "DISMISSED" : "REVIEWED" },
				permissions: adminACL,
			});
			const current = await get("signals", signalId);
			if (
				current.postId !== postId ||
				current.$updatedAt !== signalVersion ||
				current.status !== "PENDING"
			)
				throw new AuthFailure("forbidden");
			if (operation === "reject")
				await db.updateRow({
					databaseId,
					tableId: "posts",
					rowId: postId,
					transactionId,
					data: { status: "REJECTED" },
					permissions: [
						...adminACL,
						Permission.read(Role.user(String(p.userId))),
					],
				});
		});
		return { postId, signalId, operation };
	});
}
