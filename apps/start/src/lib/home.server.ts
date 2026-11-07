import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";
import { AppwriteException, Query, TablesDB } from "node-appwrite";
import {
	AuthFailure,
	boundary,
	client,
	configuration,
	identity,
	mutation,
	type Viewer,
} from "./auth-context.server";
import {
	latestPublished,
	publishedByAuthors,
	publishedById,
} from "./feed.server";
import { safeImage } from "./feed-contract";
import {
	type Badge,
	completion,
	type Featured,
	type HomeData,
	rankFeatured,
	trend,
	viewDay,
	type WeekStats,
	weekWindow,
} from "./home-contract";
import type { Validated } from "./profile-input";

const LOCKER_SIZE = 8;
const FOLLOWING_SCAN = 100;
const CANDIDATES = 200;
function connection() {
	const c = configuration(),
		databaseId = process.env.START_APPWRITE_DATABASE;
	if (!databaseId) throw new AuthFailure("unavailable");
	const separate = (name: string) => {
		const key = process.env[name];
		if (!key || key === c.key) throw new AuthFailure("unavailable");
		return new TablesDB(client(c).setKey(key));
	};
	return {
		databaseId,
		publicDB: new TablesDB(client(c)),
		reader: () => separate("START_APPWRITE_FEED_READER_KEY"),
		writer: () => separate("START_APPWRITE_INTERACTION_WRITER_KEY"),
		admin: () => separate("START_APPWRITE_MODERATION_WRITER_KEY"),
	};
}
type Connection = ReturnType<typeof connection>;
const codeOf = (e: unknown) => (e instanceof AppwriteException ? e.code : 0);
async function visiblePost(c: Connection, id: string) {
	const post = await c.publicDB
		.getRow({
			databaseId: c.databaseId,
			tableId: "posts",
			rowId: id,
			queries: [Query.select(["$id", "userId", "status"])],
		})
		.catch((e) => {
			throw [401, 403, 404].includes(codeOf(e))
				? new AuthFailure("forbidden")
				: e;
		});
	if (post.status !== "PUBLISHED") throw new AuthFailure("forbidden");
	return post;
}
async function optionalViewer() {
	if (!getCookie(configuration().cookie.name)) return null;
	try {
		return (await identity()).viewer;
	} catch (e) {
		if (e instanceof AuthFailure && e.reason === "unauthorized") return null;
		throw e;
	}
}
async function total(c: Connection, tableId: string, queries: string[]) {
	return (
		await c.reader().listRows({
			databaseId: c.databaseId,
			tableId,
			queries: [...queries, Query.select(["$id"]), Query.limit(1)],
			total: true,
		})
	).total;
}
async function grouped(
	c: Connection,
	tableId: string,
	field: string,
	queries: string[],
	limit: number,
) {
	const rows = await c.reader().listRows({
		databaseId: c.databaseId,
		tableId,
		queries: [
			...queries,
			Query.groupBy([field]),
			Query.count("$id", "count"),
			Query.limit(limit),
		],
		total: false,
	});
	return new Map(rows.rows.map((r) => [String(r[field]), Number(r.count)]));
}
async function week(c: Connection, viewer: Viewer): Promise<WeekStats> {
	const w = weekWindow(),
		mine = [Query.equal("authorId", viewer.id)];
	const [profile, posts, views, previous, followers, fresh, perPost] =
		await Promise.all([
			c
				.reader()
				.getRow({
					databaseId: c.databaseId,
					tableId: "profiles",
					rowId: viewer.id,
					queries: [
						Query.select([
							"name",
							"image",
							"biography",
							"position",
							"foot",
							"localisation",
							"jerseyNumber",
							"clubId",
							"clubName",
						]),
					],
				})
				.catch((e): Record<string, never> => {
					if (codeOf(e) === 404) return {};
					throw e;
				}),
			total(c, "posts", [
				Query.equal("userId", viewer.id),
				Query.equal("status", "PUBLISHED"),
				Query.greaterThanEqual("createdAt", w.since),
			]),
			total(c, "post_views", [
				...mine,
				Query.greaterThanEqual("createdAt", w.since),
			]),
			total(c, "post_views", [
				...mine,
				Query.greaterThanEqual("createdAt", w.previousSince),
				Query.lessThan("createdAt", w.since),
			]),
			total(c, "follows", [Query.equal("followingId", viewer.id)]),
			total(c, "follows", [
				Query.equal("followingId", viewer.id),
				Query.greaterThanEqual("createdAt", w.since),
			]),
			grouped(
				c,
				"post_views",
				"postId",
				[...mine, Query.greaterThanEqual("createdAt", w.since)],
				CANDIDATES,
			),
		]);
	const top = rankFeatured(perPost, new Map())[0],
		[topPost] = top ? await publishedById([top]) : [];
	return {
		weekStart: w.weekStart,
		weekEnd: w.weekEnd,
		weekNumber: w.weekNumber,
		name: profile.name ?? viewer.name ?? null,
		jerseyNumber: profile.jerseyNumber ?? null,
		posts,
		views,
		viewsTrend: trend(views, previous),
		followers,
		newFollowers: fresh,
		topTitle: topPost?.title ?? null,
		completion: completion({
			image: profile.image,
			biography: profile.biography,
			position: profile.position,
			foot: profile.foot,
			localisation: profile.localisation,
			jerseyNumber: profile.jerseyNumber,
			club: profile.clubId || profile.clubName || null,
		}),
	};
}
async function featured(c: Connection): Promise<Featured | null> {
	const w = weekWindow(),
		since = [Query.greaterThanEqual("createdAt", w.since)];
	let pinned: string | null = null;
	try {
		const row = await c.reader().getRow({
			databaseId: c.databaseId,
			tableId: "featured_posts",
			rowId: w.weekStart,
			queries: [Query.select(["postId"])],
		});
		pinned = String(row.postId);
	} catch (e) {
		if (!(e instanceof AppwriteException && e.code === 404)) throw e;
	}
	const views = await grouped(c, "post_views", "postId", since, CANDIDATES),
		ids = [...views.keys()],
		likes = ids.length
			? await grouped(
					c,
					"likes",
					"postId",
					[Query.equal("postId", ids), ...since],
					ids.length,
				)
			: new Map<string, number>(),
		ranked = rankFeatured(views, likes).slice(0, 10),
		candidates = pinned
			? [pinned, ...ranked.filter((id) => id !== pinned)]
			: ranked;
	// Hidden, withdrawn or deleted posts drop out; the next best candidate takes the slot.
	const [post] = candidates.length
		? await publishedById(candidates.slice(0, 10))
		: await latestPublished(1);
	if (!post) return null;
	return {
		post,
		views:
			views.get(post.id) ??
			(await total(c, "post_views", [
				Query.equal("postId", post.id),
				...since,
			])),
		weekNumber: w.weekNumber,
		pinned: post.id === pinned,
	};
}
async function suggestions(viewer: Viewer | null, skip: string | null) {
	const posts = await latestPublished(LOCKER_SIZE + 1, viewer?.id);
	return posts.filter((p) => p.id !== skip).slice(0, LOCKER_SIZE);
}
async function locker(c: Connection, viewer: Viewer) {
	const following = await c.reader().listRows({
		databaseId: c.databaseId,
		tableId: "follows",
		queries: [
			Query.equal("followerId", viewer.id),
			Query.orderDesc("createdAt"),
			Query.select(["followingId"]),
			Query.limit(FOLLOWING_SCAN),
		],
		total: false,
	});
	return publishedByAuthors(
		following.rows.map((r) => String(r.followingId)),
		weekWindow().since,
		LOCKER_SIZE,
	);
}
// Each section degrades alone: the feed must stay usable if stats or ranking fail.
async function section<T>(name: string, run: () => Promise<T>, fallback: T) {
	try {
		return await run();
	} catch (e) {
		if (e instanceof AuthFailure && e.reason === "unauthorized") throw e;
		console.error(JSON.stringify({ home: name, code: codeOf(e) }));
		return fallback;
	}
}
export function readHome() {
	return boundary(async (): Promise<HomeData> => {
		const c = connection(),
			viewer = await optionalViewer();
		const [w, f, l] = await Promise.all([
			viewer ? section("week", () => week(c, viewer), null) : null,
			section("featured", () => featured(c), null),
			viewer ? section("locker", () => locker(c, viewer), []) : [],
		]);
		const suggested = l.length === 0,
			shelf = suggested
				? await section(
						"suggestions",
						() => suggestions(viewer, f?.post.id ?? null),
						[],
					)
				: l;
		return {
			signedIn: viewer !== null,
			week: w,
			featured: f,
			locker: shelf,
			lockerSuggested: suggested,
			canPin: viewer?.role === "admin",
		};
	});
}
// One view per viewer, post and UTC day: the deterministic row ID makes replays a 409.
export function recordView(input: Validated<{ id: string }>) {
	return boundary(async () => {
		mutation();
		const { viewer } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const c = connection();
		const post = await visiblePost(c, input.data.id);
		if (post.userId === viewer.id) return { counted: false };
		const now = new Date(),
			day = viewDay(now),
			rowId = createHash("sha256")
				.update(JSON.stringify([post.$id, viewer.id, day]))
				.digest("hex")
				.slice(0, 36);
		try {
			await c.writer().createRow({
				databaseId: c.databaseId,
				tableId: "post_views",
				rowId,
				data: {
					postId: post.$id,
					viewerId: viewer.id,
					authorId: String(post.userId),
					day,
					createdAt: now.toISOString(),
				},
				permissions: [],
			});
		} catch (e) {
			if (e instanceof AppwriteException && e.code === 409)
				return { counted: false };
			throw e;
		}
		return { counted: true };
	});
}
export function pinFeatured(input: Validated<{ id: string | null }>) {
	return boundary(async () => {
		mutation();
		const { viewer } = await identity();
		if (viewer.role !== "admin") throw new AuthFailure("forbidden");
		if (!input.valid) throw new AuthFailure("invalid");
		const c = connection(),
			db = c.admin(),
			w = weekWindow(),
			ref = {
				databaseId: c.databaseId,
				tableId: "featured_posts",
				rowId: w.weekStart,
			};
		if (input.data.id === null) {
			await db.deleteRow(ref).catch((e) => {
				if (codeOf(e) !== 404) throw e;
			});
			return { weekStart: w.weekStart, postId: null };
		}
		const [post] = await publishedById([input.data.id]);
		if (!post) throw new AuthFailure("forbidden");
		await db.upsertRow({
			...ref,
			data: {
				postId: post.id,
				weekStart: w.weekStart,
				pinnedBy: viewer.id,
				createdAt: new Date().toISOString(),
			},
			permissions: [],
		});
		return { weekStart: w.weekStart, postId: post.id };
	});
}
export function readBadge() {
	return boundary(async (): Promise<Badge> => {
		const viewer = await optionalViewer();
		if (!viewer) return null;
		const c = connection();
		const row = await c
			.reader()
			.getRow({
				databaseId: c.databaseId,
				tableId: "profiles",
				rowId: viewer.id,
				queries: [Query.select(["name", "image", "jerseyNumber"])],
			})
			.catch((e) => {
				if (codeOf(e) === 404) return null;
				throw e;
			});
		return {
			id: viewer.id,
			name: (row?.name as string | null | undefined) ?? viewer.name ?? null,
			image: safeImage((row?.image as string | null | undefined) ?? null),
			jerseyNumber: (row?.jerseyNumber as number | null | undefined) ?? null,
		};
	});
}
