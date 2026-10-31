import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";
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
import { readPost } from "./feed.server";
import {
	InteractionRevisionConflict,
	retryInteraction,
} from "./interactions-concurrency";
import type {
	CommentPage,
	FavoritePage,
	InteractionChange,
	InteractionEvent,
	InteractionState,
} from "./interactions-contract";
import type {
	CommentInput,
	DeleteInput,
	FavoriteInput,
	PageInput,
	PairInput,
} from "./interactions-input";
import {
	interactionCursor,
	parseInteractionCursor,
} from "./interactions-input";
import { stageNotification } from "./notification-outbox.server";
import type { Validated } from "./profile-input";

function retryable(error: unknown) {
	return (
		error instanceof InteractionRevisionConflict ||
		(error instanceof AppwriteException && error.code === 409)
	);
}
function retryBoundary<T>(run: () => Promise<T>) {
	return boundary(() => retryInteraction(run, retryable));
}
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
	};
}
async function optionalIdentity() {
	if (!getCookie(configuration().cookie.name)) return null;
	try {
		return (await identity()).viewer;
	} catch (e) {
		if (e instanceof AuthFailure && e.reason === "unauthorized") return null;
		throw e;
	}
}
// Always keyless: even admin and owner sessions cannot turn a private post into a public interaction target.
async function visible(id: string) {
	const c = connection();
	try {
		const row = await c.publicDB.getRow({
			databaseId: c.databaseId,
			tableId: "posts",
			rowId: id,
			queries: [Query.select(["$id", "$updatedAt", "userId", "status"])],
		});
		if (row.status !== "PUBLISHED") throw new AuthFailure("forbidden");
		const author = await c.publicDB.getRow({
			databaseId: c.databaseId,
			tableId: "profiles",
			rowId: String(row.userId),
			queries: [Query.select(["$id", "isOnboarded"])],
		});
		if (!author.isOnboarded) throw new AuthFailure("forbidden");
		return row;
	} catch (e) {
		if (e instanceof AppwriteException && [401, 403, 404].includes(e.code))
			throw new AuthFailure("forbidden");
		throw e;
	}
}
async function edge(
	db: TablesDB,
	tableId: string,
	postId: string,
	userId: string,
) {
	const c = connection();
	const r = await db.listRows({
		databaseId: c.databaseId,
		tableId,
		queries: [
			Query.equal("postId", postId),
			Query.equal("userId", userId),
			Query.select(["$id", "userId", "postId"]),
			Query.limit(1),
		],
		total: false,
	});
	return r.rows[0] ?? null;
}
async function snapshotOnce(
	id: string,
	viewerId: string | null,
): Promise<InteractionState> {
	const before = await visible(id),
		c = connection(),
		db = c.reader();
	const count = async (tableId: string) =>
		(
			await db.listRows({
				databaseId: c.databaseId,
				tableId,
				queries: [
					Query.equal("postId", id),
					Query.select(["$id"]),
					Query.limit(1),
				],
				total: true,
			})
		).total;
	const [likes, comments, like, favorite] = await Promise.all([
		count("likes"),
		count("comments"),
		viewerId ? edge(db, "likes", id, viewerId) : null,
		viewerId ? edge(db, "favorites", id, viewerId) : null,
	]);
	const after = await visible(id);
	if (before.userId !== after.userId) throw new AuthFailure("forbidden");
	if (before.$updatedAt !== after.$updatedAt)
		throw new InteractionRevisionConflict();
	return {
		postId: id,
		viewerId,
		liked: !!like,
		favorited: !!favorite,
		likes,
		comments,
	};
}
function snapshot(id: string, viewerId: string | null) {
	return retryInteraction(() => snapshotOnce(id, viewerId), retryable);
}
export function readInteractionState(input: Validated<{ id: string }>) {
	return boundary(async () => {
		if (!input.valid) throw new AuthFailure("invalid");
		return snapshot(input.data.id, (await optionalIdentity())?.id ?? null);
	});
}
// Anchor each child write to the parent in the same transaction. No business timestamp,
// slug, text or ACL is modified. Concurrent archive/delete/edit conflicts fail closed.
async function atomic<T>(
	post: Models.DefaultRow,
	run: (db: TablesDB, transactionId: string) => Promise<T>,
) {
	const c = connection(),
		db = c.writer(),
		tx = await db.createTransaction({ ttl: 60 });
	try {
		await db.updateRow({
			databaseId: c.databaseId,
			tableId: "posts",
			rowId: post.$id,
			data: { status: "PUBLISHED" },
			transactionId: tx.$id,
		});
		const current = await visible(post.$id);
		if (current.userId !== post.userId) throw new AuthFailure("forbidden");
		if (current.$updatedAt !== post.$updatedAt)
			throw new InteractionRevisionConflict();
		const result = await run(db, tx.$id);
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return result;
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
function event(
	type: InteractionEvent["type"],
	actorId: string,
	post: Models.DefaultRow,
	entityId: string,
	occurredAt: string,
): InteractionEvent {
	return {
		version: 1,
		type,
		eventId: `${type}:${entityId}`,
		actorId,
		recipientId: type.startsWith("FAVORITE") ? actorId : String(post.userId),
		postId: post.$id,
		entityId,
		occurredAt,
	};
}
export function changeInteraction(input: Validated<PairInput>) {
	return retryBoundary(async (): Promise<InteractionChange> => {
		mutation();
		const { viewer } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const { id, kind, active } = input.data,
			post = await visible(id),
			c = connection(),
			tableId = kind === "like" ? "likes" : "favorites";
		const before = await edge(c.reader(), tableId, id, viewer.id),
			entityId = before?.$id ?? ID.unique(),
			occurredAt = new Date().toISOString();
		let emitted: InteractionEvent | null = null;
		if (active !== !!before) {
			try {
				await atomic(post, async (db, transactionId) => {
					if (active)
						await db.createRow({
							databaseId: c.databaseId,
							tableId,
							rowId: entityId,
							transactionId,
							data: {
								postId: id,
								userId: viewer.id,
								createdAt: occurredAt,
								updatedAt: occurredAt,
							},
							permissions:
								kind === "favorite"
									? [Permission.read(Role.user(viewer.id))]
									: [],
						});
					if (active && kind === "like")
						await stageNotification(transactionId, {
							version: 1,
							eventId: `LIKE_CREATED:${entityId}`,
							type: "LIKE",
							actorId: viewer.id,
							recipientId: String(post.userId),
							targetId: id,
							entityId,
							occurredAt,
						});
					if (!active)
						await db.deleteRow({
							databaseId: c.databaseId,
							tableId,
							rowId: entityId,
							transactionId,
						});
				});
				emitted = event(
					kind === "like"
						? active
							? "LIKE_CREATED"
							: "LIKE_REMOVED"
						: active
							? "FAVORITE_CREATED"
							: "FAVORITE_REMOVED",
					viewer.id,
					post,
					entityId,
					occurredAt,
				);
			} catch (e) {
				// Unique pairs preserve arbitrary imported edge IDs. Only verified desired
				// state is a replay; transaction conflicts are never blindly swallowed.
				if (!(e instanceof AppwriteException && [404, 409].includes(e.code)))
					throw e;
				await visible(id);
				if (!!(await edge(c.reader(), tableId, id, viewer.id)) !== active)
					throw e;
			}
		}
		return { state: await snapshot(id, viewer.id), event: emitted };
	});
}
export function createComment(input: Validated<CommentInput>) {
	return retryBoundary(async (): Promise<InteractionChange> => {
		mutation();
		const { viewer } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const { id, content, requestId } = input.data,
			post = await visible(id),
			c = connection();
		// Same logical request is stable across retries; another actor cannot reserve it.
		const entityId = createHash("sha256")
			.update(JSON.stringify([viewer.id, id, requestId]))
			.digest("hex")
			.slice(0, 36);
		try {
			const previous = await c.reader().getRow({
				databaseId: c.databaseId,
				tableId: "comments",
				rowId: entityId,
				queries: [Query.select(["postId", "userId", "content"])],
			});
			if (
				previous.userId !== viewer.id ||
				previous.postId !== id ||
				previous.content !== content
			)
				throw new AuthFailure("invalid");
			return { state: await snapshot(id, viewer.id), event: null };
		} catch (error) {
			if (!(error instanceof AppwriteException && error.code === 404))
				throw error;
		}
		const occurredAt = new Date().toISOString();
		let emitted: InteractionEvent | null = null;
		try {
			await atomic(post, async (db, transactionId) => {
				await db.createRow({
					databaseId: c.databaseId,
					tableId: "comments",
					rowId: entityId,
					transactionId,
					data: {
						postId: id,
						userId: viewer.id,
						content,
						createdAt: occurredAt,
						updatedAt: occurredAt,
					},
					permissions: [],
				});
				await stageNotification(transactionId, {
					version: 1,
					eventId: `COMMENT_CREATED:${entityId}`,
					type: "COMMENT",
					actorId: viewer.id,
					recipientId: String(post.userId),
					targetId: id,
					entityId,
					occurredAt,
				});
			});
			emitted = event("COMMENT_CREATED", viewer.id, post, entityId, occurredAt);
		} catch (e) {
			if (!(e instanceof AppwriteException && e.code === 409)) throw e;
			let existing: Models.DefaultRow;
			try {
				existing = await c.reader().getRow({
					databaseId: c.databaseId,
					tableId: "comments",
					rowId: entityId,
					queries: [Query.select(["postId", "userId", "content"])],
				});
			} catch (missing) {
				if (missing instanceof AppwriteException && missing.code === 404)
					throw new InteractionRevisionConflict();
				throw missing;
			}
			if (
				existing.userId !== viewer.id ||
				existing.postId !== id ||
				existing.content !== content
			)
				throw new AuthFailure("invalid");
		}
		return { state: await snapshot(id, viewer.id), event: emitted };
	});
}
export function removeComment(input: Validated<DeleteInput>) {
	return retryBoundary(async (): Promise<InteractionChange> => {
		mutation();
		const { viewer } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const { id, commentId } = input.data,
			post = await visible(id),
			c = connection();
		let comment: Models.DefaultRow;
		try {
			comment = await c.reader().getRow({
				databaseId: c.databaseId,
				tableId: "comments",
				rowId: commentId,
				queries: [Query.select(["postId", "userId"])],
			});
		} catch (e) {
			if (e instanceof AppwriteException && e.code === 404)
				throw new AuthFailure("forbidden");
			throw e;
		}
		if (
			comment.postId !== id ||
			(comment.userId !== viewer.id && viewer.role !== "admin")
		)
			throw new AuthFailure("forbidden");
		let emitted: InteractionEvent | null = null;
		try {
			await atomic(post, async (db, transactionId) => {
				await db.deleteRow({
					databaseId: c.databaseId,
					tableId: "comments",
					rowId: commentId,
					transactionId,
				});
			});
			emitted = event(
				"COMMENT_REMOVED",
				viewer.id,
				post,
				commentId,
				new Date().toISOString(),
			);
		} catch (e) {
			if (!(e instanceof AppwriteException && e.code === 404)) throw e;
		}
		return { state: await snapshot(id, viewer.id), event: emitted };
	});
}
export function readComments(input: Validated<PageInput>) {
	return retryBoundary(async (): Promise<CommentPage> => {
		if (!input.valid) throw new AuthFailure("invalid");
		const { id, cursor } = input.data,
			scope = `comments:${id}`,
			before = await visible(id),
			viewer = await optionalIdentity(),
			c = connection();
		const queries = [
			Query.equal("postId", id),
			Query.orderDesc("createdAt"),
			Query.orderDesc("$id"),
			Query.limit(21),
			Query.select(["$id", "userId", "content", "createdAt"]),
		];
		let pivot: ReturnType<typeof parseInteractionCursor>;
		try {
			pivot = parseInteractionCursor(scope, cursor);
		} catch {
			throw new AuthFailure("invalid");
		}
		if (pivot)
			queries.push(
				Query.or([
					Query.lessThan("createdAt", pivot.time),
					Query.and([
						Query.equal("createdAt", pivot.time),
						Query.lessThan("$id", pivot.id),
					]),
				]),
			);
		const r = await c.reader().listRows({
			databaseId: c.databaseId,
			tableId: "comments",
			queries,
			total: false,
		});
		const comments = await Promise.all(
			r.rows.slice(0, 20).map(async (row) => {
				let name: string | null = null;
				try {
					const p = await c.publicDB.getRow({
						databaseId: c.databaseId,
						tableId: "profiles",
						rowId: String(row.userId),
						queries: [Query.select(["name", "isOnboarded"])],
					});
					if (p.isOnboarded) name = typeof p.name === "string" ? p.name : null;
				} catch (e) {
					if (
						!(
							e instanceof AppwriteException && [401, 403, 404].includes(e.code)
						)
					)
						throw e;
				}
				return {
					id: row.$id,
					content: String(row.content),
					createdAt: new Date(String(row.createdAt)).toISOString(),
					author: { id: String(row.userId), name },
					canDelete:
						!!viewer && (viewer.id === row.userId || viewer.role === "admin"),
				};
			}),
		);
		if ((await visible(id)).$updatedAt !== before.$updatedAt)
			throw new InteractionRevisionConflict();
		return {
			viewerId: viewer?.id ?? null,
			comments,
			nextCursor:
				r.rows.length > 20 && r.rows[19]
					? interactionCursor(
							scope,
							String(r.rows[19].createdAt),
							r.rows[19].$id,
						)
					: null,
		};
	});
}
export function readFavorites(input: Validated<FavoriteInput>) {
	return boundary(async (): Promise<FavoritePage> => {
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const c = connection(),
			queries = [
				Query.equal("userId", viewer.id),
				Query.orderDesc("createdAt"),
				Query.orderDesc("$id"),
				Query.limit(21),
				Query.select(["$id", "userId", "postId", "createdAt"]),
			];
		const scope = `favorites:${viewer.id}`;
		let pivot: ReturnType<typeof parseInteractionCursor>;
		try {
			pivot = parseInteractionCursor(scope, input.data.cursor);
		} catch {
			throw new AuthFailure("invalid");
		}
		if (pivot)
			queries.push(
				Query.or([
					Query.lessThan("createdAt", pivot.time),
					Query.and([
						Query.equal("createdAt", pivot.time),
						Query.lessThan("$id", pivot.id),
					]),
				]),
			);
		const r = await new TablesDB(sessionClient).listRows({
			databaseId: c.databaseId,
			tableId: "favorites",
			queries,
			total: false,
		});
		const posts = await Promise.all(
			r.rows.slice(0, 20).map(async (row) => {
				if (row.userId !== viewer.id) throw new AuthFailure("forbidden");
				try {
					await visible(String(row.postId));
				} catch (e) {
					if (e instanceof AuthFailure && e.reason === "forbidden") return null;
					throw e;
				}
				const p = await readPost(String(row.postId));
				if (!p.ok) throw new AuthFailure("unavailable");
				return p.value;
			}),
		);
		return {
			viewerId: viewer.id,
			posts: posts.filter((p) => p !== null),
			nextCursor:
				r.rows.length > 20 && r.rows[19]
					? interactionCursor(
							scope,
							String(r.rows[19].createdAt),
							r.rows[19].$id,
						)
					: null,
		};
	});
}
