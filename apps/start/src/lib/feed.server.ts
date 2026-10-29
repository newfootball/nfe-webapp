import "@tanstack/react-start/server-only";
import {
	getCookie,
	getRequest,
	setResponseHeader,
	setResponseStatus,
} from "@tanstack/react-start/server";
import {
	AppwriteException,
	Client,
	type Models,
	Query,
	TablesDB,
} from "node-appwrite";
import { z } from "zod";
import {
	AuthFailure,
	configuration,
	identity,
	privateResponse,
} from "./auth-context.server";
import {
	authorDTO,
	type ExploreResult,
	type ExploreUser,
	type FeedPage,
	type FeedResult,
	type PublicPost,
	postDTO,
} from "./feed-contract";
import {
	decodeCursor,
	type ExploreRequest,
	encodeCursor,
	type FeedRequest,
} from "./feed-input";

function connection() {
	const endpoint = process.env.START_APPWRITE_ENDPOINT,
		project = process.env.START_APPWRITE_PROJECT,
		databaseId = process.env.START_APPWRITE_DATABASE;
	if (!endpoint || !project || !databaseId) throw new Error("Feed unavailable");
	const url = new URL(endpoint);
	if (
		url.protocol !== "https:" &&
		!(
			process.env.START_AUTH_ALLOW_HTTP_LOOPBACK === "true" &&
			url.protocol === "http:" &&
			["localhost", "127.0.0.1"].includes(url.hostname)
		)
	)
		throw new Error("Feed unavailable");
	const make = () => {
		const client = new Client().setEndpoint(endpoint).setProject(project);
		if (process.env.START_FEED_TRACE === "1")
			client.addHeader(
				"x-nfe-proof-trace",
				getRequest().headers.get("x-nfe-proof-trace") ?? "unlabelled",
			);
		return client;
	};
	const publicDB = new TablesDB(make());
	return {
		databaseId,
		publicDB,
		reader: () => {
			const key = process.env.START_APPWRITE_FEED_READER_KEY;
			if (
				!key ||
				key === process.env.START_APPWRITE_SESSION_KEY ||
				key === process.env.START_APPWRITE_PROFILE_WRITER_KEY
			)
				throw new Error("Feed unavailable");
			return new TablesDB(make().setKey(key));
		},
	};
}
type Connection = ReturnType<typeof connection>;
// Opt-in synthetic telemetry. Values are projected sizes/counts, never row contents,
// credentials, SDK exceptions, or canonical private media identifiers.
function trace(
	tableId: string,
	queries: string[],
	started: number,
	rows: number,
	bytes: number,
	failed = false,
) {
	if (process.env.START_FEED_TRACE !== "1") return;
	process.stdout.write(
		`${JSON.stringify({ trace: getRequest().headers.get("x-nfe-proof-trace"), feedCall: tableId, queries, rows, bytes, failed, ms: performance.now() - started })}\n`,
	);
}
async function list(
	c: Connection,
	db: TablesDB,
	tableId: string,
	queries: string[],
) {
	const started = performance.now();
	try {
		const r = await db.listRows({
			databaseId: c.databaseId,
			tableId,
			queries,
			total: false,
		});
		trace(
			tableId,
			queries,
			started,
			r.rows.length,
			Buffer.byteLength(JSON.stringify(r)),
		);
		return r.rows;
	} catch (e) {
		trace(tableId, queries, started, 0, 0, true);
		throw e;
	}
}
async function visiblePost(c: Connection, id: string) {
	const started = performance.now(),
		queries = [Query.select(fields)];
	try {
		const row = await c.publicDB.getRow({
			databaseId: c.databaseId,
			tableId: "posts",
			rowId: id,
			queries,
		});
		trace(
			"posts.getRow",
			[id, ...queries],
			started,
			1,
			Buffer.byteLength(JSON.stringify(row)),
		);
		return row;
	} catch (e) {
		trace("posts.getRow", [id, ...queries], started, 0, 0, true);
		throw e;
	}
}
const fields = [
	"$id",
	"userId",
	"slug",
	"title",
	"description",
	"type",
	"status",
	"createdAt",
	"updatedAt",
	"publishedAt",
	"expiresAt",
];
const authorFields = [
	"$id",
	"name",
	"image",
	"localisation",
	"userType",
	"position",
	"isOnboarded",
	"createdAt",
];
async function boundary<T>(run: () => Promise<T>): Promise<FeedResult<T>> {
	privateResponse();
	try {
		return { ok: true, value: await run() };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}
function seek(field: string, time: string | null, id: string) {
	// Appwrite2.6.2/PostgreSQL DESC puts NULL first. Continue within that
	// partition, then non-null dates; no pivot lookup or cursorAfter dependency.
	if (time === null)
		return Query.or([
			Query.and([Query.isNull(field), Query.lessThan("$id", id)]),
			Query.isNotNull(field),
		]);
	return Query.and([
		Query.isNotNull(field),
		Query.or([
			Query.lessThan(field, time),
			Query.and([Query.equal(field, time), Query.lessThan("$id", id)]),
		]),
	]);
}
const countRow = z.object({ count: z.number().int().nonnegative() });
async function counts(
	c: Connection,
	db: TablesDB,
	table: string,
	field: string,
	ids: string[],
	extra: string[] = [],
) {
	if (!ids.length) return new Map<string, number>();
	const rows = await list(c, db, table, [
		Query.equal(field, ids),
		...extra,
		Query.groupBy([field]),
		Query.count("$id", "count"),
		Query.limit(ids.length),
	]);
	const map = new Map(ids.map((id) => [id, 0]));
	for (const row of rows) {
		const key = String(row[field]);
		if (!map.has(key)) throw new Error("Foreign aggregate");
		map.set(key, countRow.parse(row).count);
	}
	return map;
}
async function assemble(
	c: Connection,
	rows: Models.DefaultRow[],
): Promise<PublicPost[]> {
	if (!rows.length) return [];
	if (rows.some((r) => r.status !== "PUBLISHED"))
		throw new Error("Hidden parent");
	const ids = rows.map((r) => r.$id),
		authors = [...new Set(rows.map((r) => String(r.userId)))];
	// The privileged client receives only IDs of keyless-visible PUBLISHED parents.
	const [profiles, likes, comments] = await Promise.all([
		list(c, c.publicDB, "profiles", [
			Query.equal("$id", authors),
			Query.equal("isOnboarded", true),
			Query.select(authorFields),
			Query.limit(authors.length),
		]),
		counts(c, c.reader(), "likes", "postId", ids),
		counts(c, c.reader(), "comments", "postId", ids),
	]);
	const byAuthor = new Map(profiles.map((r) => [r.$id, authorDTO(r)]));
	// Recheck visibility after child aggregation; revocation causes a failed read,
	// never a partial misleading page or counts from a hidden parent.
	const visible = await list(c, c.publicDB, "posts", [
		Query.equal("$id", ids),
		Query.equal("status", "PUBLISHED"),
		Query.select(["$id", "userId", "updatedAt"]),
		Query.limit(ids.length),
	]);
	const byId = new Map(visible.map((r) => [r.$id, r]));
	return rows.map((r) => {
		const current = byId.get(r.$id),
			author = byAuthor.get(String(r.userId));
		if (
			!current ||
			!author ||
			current.userId !== r.userId ||
			current.updatedAt !== r.updatedAt
		)
			throw new Error("Parent changed");
		return postDTO(r, author, {
			likes: likes.get(r.$id),
			comments: comments.get(r.$id),
		});
	});
}
async function feed(c: Connection, input: FeedRequest): Promise<FeedPage> {
	const cursor = decodeCursor(input),
		field = input.q ? "publishedAt" : "createdAt";
	const queries = [
		Query.equal("status", "PUBLISHED"),
		Query.orderDesc(field),
		Query.orderDesc("$id"),
		Query.limit(input.limit + 1),
		Query.select(fields),
	];
	if (input.authorId) queries.push(Query.equal("userId", input.authorId));
	if (input.q)
		queries.push(
			Query.or([
				Query.contains("titleFolded", [input.q]),
				Query.contains("descriptionFolded", [input.q]),
			]),
		);
	if (cursor) queries.push(seek(field, cursor.time, cursor.id));
	const rows = await list(c, c.publicDB, "posts", queries),
		page = rows.slice(0, input.limit),
		last = page.at(-1);
	const posts = await assemble(c, page);
	return {
		posts,
		nextCursor:
			rows.length > input.limit && last
				? encodeCursor(
						input,
						last[field] === null
							? null
							: new Date(String(last[field])).toISOString(),
						last.$id,
					)
				: null,
	};
}
export function readFeed(input: FeedRequest): Promise<FeedResult<FeedPage>> {
	try {
		decodeCursor(input);
	} catch {
		privateResponse();
		return Promise.resolve({ ok: false, error: "invalid" });
	}
	return boundary(() => feed(connection(), input));
}
export function readPost(id: string): Promise<FeedResult<PublicPost | null>> {
	return boundary(async () => {
		const c = connection();
		let row: Models.DefaultRow;
		try {
			row = await visiblePost(c, id);
		} catch (e) {
			if (
				e instanceof AppwriteException &&
				e.code === 404 &&
				e.type === "row_not_found"
			) {
				setResponseStatus(404);
				return null;
			}
			throw e;
		}
		if (row.status !== "PUBLISHED") {
			setResponseStatus(404);
			return null;
		}
		return (await assemble(c, [row]))[0] ?? null;
	});
}
async function optionalViewer() {
	// No cookie => no account RPC. Session is used only for personalized suggestions.
	if (!getCookie(configuration().cookie.name)) return null;
	try {
		const start = performance.now();
		const context = await identity();
		trace("account.get", [], start, 1, 0);
		trace("account.getSession", [], start, 1, 0);
		return context;
	} catch (e) {
		if (e instanceof AuthFailure && e.reason === "unauthorized") return null;
		throw e;
	}
}
async function users(c: Connection, q: string): Promise<ExploreUser[]> {
	const viewer = q ? null : await optionalViewer();
	const results: Models.DefaultRow[] = [];
	let pivot: Models.DefaultRow | undefined;
	// Bounded candidate batches avoid downloading all follow edges. A capacity
	// failure is unavailable, not a false empty result. No browser join/filter.
	for (let batch = 0; batch < 8; batch++) {
		const query = [
			Query.equal("isOnboarded", true),
			Query.orderDesc("createdAt"),
			Query.orderDesc("$id"),
			Query.limit(20),
			Query.select(authorFields),
		];
		if (q) query.push(Query.contains("nameFolded", [q]));
		if (pivot)
			query.push(
				seek(
					"createdAt",
					new Date(String(pivot.createdAt)).toISOString(),
					pivot.$id,
				),
			);
		if (viewer) query.push(Query.notEqual("$id", viewer.viewer.id));
		const candidates = await list(c, c.publicDB, "profiles", query);
		let followed = new Set<string>();
		if (viewer && candidates.length) {
			const edges = await list(
				c,
				new TablesDB(viewer.sessionClient),
				"follows",
				[
					Query.equal("followerId", viewer.viewer.id),
					Query.equal(
						"followingId",
						candidates.map((r) => r.$id),
					),
					Query.limit(candidates.length),
					Query.select(["followingId"]),
				],
			);
			followed = new Set(edges.map((r) => String(r.followingId)));
		}
		results.push(
			...candidates
				.filter((r) => !followed.has(r.$id))
				.slice(0, 10 - results.length),
		);
		if (results.length === 10 || candidates.length < 20) break;
		if (batch === 7) throw new Error("Suggestion capacity reached");
		pivot = candidates.at(-1);
	}
	if (!results.length) return [];
	const ids = results.map((r) => r.$id);
	const [posts, followers] = await Promise.all([
		counts(c, c.publicDB, "posts", "userId", ids, [
			Query.equal("status", "PUBLISHED"),
		]),
		counts(c, c.publicDB, "follows", "followingId", ids),
	]);
	return results.map((row) => ({
		...authorDTO(row),
		_count: { posts: posts.get(row.$id)!, followeds: followers.get(row.$id)! },
	}));
}
export function readExplore(
	input: ExploreRequest,
): Promise<FeedResult<ExploreResult>> {
	return boundary(async () => {
		const c = connection();
		setResponseHeader("Vary", "Cookie");
		const [people, posts] = await Promise.all([
			input.tab === "posts" ? Promise.resolve([]) : users(c, input.q),
			input.tab === "users" || !input.q
				? Promise.resolve([])
				: feed(c, { q: input.q, limit: 10, cursor: null }).then((r) => r.posts),
		]);
		return { users: people, posts };
	});
}
