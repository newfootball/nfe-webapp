import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { AppwriteException, type Models, Query, TablesDB } from "node-appwrite";
import {
	AuthFailure,
	client,
	configuration,
	identity,
	mutation,
	privateResponse,
} from "./auth-context.server";
import { foldSearch } from "./feed-input";
import { ownPostDTO, type PostTextResult } from "./post-text-contract";
import {
	type EditPostTextInput,
	type OwnPostsInput,
	ownCursor,
	parseOwnCursor,
} from "./post-text-input";
import type { Validated } from "./profile-input";

const fields = [
	"$id",
	"$updatedAt",
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
	"validatedAt",
];
class Failure extends Error {
	constructor(readonly reason: "conflict" | "notFound") {
		super(reason);
	}
}
async function boundary<T>(run: () => Promise<T>): Promise<PostTextResult<T>> {
	privateResponse();
	try {
		return { ok: true, value: await run() };
	} catch (e) {
		if (e instanceof Failure) return { ok: false, error: e.reason };
		if (e instanceof AuthFailure)
			return {
				ok: false,
				error: e.reason === "credentials" ? "unauthorized" : e.reason,
			};
		if (e instanceof AppwriteException && e.code === 409)
			return { ok: false, error: "conflict" };
		return { ok: false, error: "unavailable" };
	}
}
function databaseId() {
	const id = process.env.START_APPWRITE_DATABASE;
	if (!id) throw new AuthFailure("unavailable");
	return id;
}
function writer() {
	const c = configuration(),
		key = process.env.START_APPWRITE_POST_TEXT_WRITER_KEY;
	if (
		!key ||
		[
			c.key,
			process.env.START_APPWRITE_FEED_READER_KEY,
			process.env.START_APPWRITE_PROFILE_WRITER_KEY,
		].includes(key)
	)
		throw new AuthFailure("unavailable");
	return new TablesDB(client(c).setKey(key));
}
function revision(row: Models.DefaultRow) {
	// Backend revision plus business snapshot: opaque token, never an authority claim.
	return createHash("sha256")
		.update(JSON.stringify(fields.map((f) => row[f])))
		.digest("hex");
}
async function self() {
	const c = await identity();
	return { viewer: c.viewer, db: new TablesDB(c.sessionClient) };
}
async function own(db: TablesDB, id: string, owner: string) {
	let row: Models.DefaultRow;
	try {
		row = await db.getRow({
			databaseId: databaseId(),
			tableId: "posts",
			rowId: id,
			queries: [Query.select(fields)],
		});
	} catch (e) {
		if (
			e instanceof AppwriteException &&
			([401, 403].includes(e.code) ||
				(e.code === 404 && e.type === "row_not_found"))
		)
			throw new Failure("notFound");
		throw e;
	}
	// Admin ACL read permission never grants edit or private-list access to someone else's post.
	if (row.userId !== owner) throw new Failure("notFound");
	return row;
}
export function readOwnPosts(input: Validated<OwnPostsInput>) {
	return boundary(async () => {
		const { viewer, db } = await self();
		if (!input.valid) throw new AuthFailure("invalid");
		const v = input.data;
		let pivot: ReturnType<typeof parseOwnCursor>;
		try {
			pivot = parseOwnCursor(v, viewer.id);
		} catch {
			throw new AuthFailure("invalid");
		}
		const queries = [
			Query.equal("userId", viewer.id),
			Query.orderDesc("createdAt"),
			Query.orderDesc("$id"),
			Query.limit(v.limit + 1),
			Query.select(fields),
		];
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
		const result = await db.listRows({
			databaseId: databaseId(),
			tableId: "posts",
			queries,
			total: false,
		});
		if (result.rows.some((r) => r.userId !== viewer.id))
			throw new AuthFailure("forbidden");
		const posts = result.rows
				.slice(0, v.limit)
				.map((r) => ownPostDTO(r, revision(r))),
			last = posts.at(-1);
		return {
			ownerId: viewer.id,
			posts,
			nextCursor:
				result.rows.length > v.limit && last
					? ownCursor(viewer.id, v.limit, last.createdAt, last.id)
					: null,
		};
	});
}
export function readOwnPost(input: Validated<{ id: string }>) {
	return boundary(async () => {
		const { viewer, db } = await self();
		if (!input.valid) throw new AuthFailure("invalid");
		const row = await own(db, input.data.id, viewer.id);
		return ownPostDTO(row, revision(row));
	});
}
export function editPostText(input: Validated<EditPostTextInput>) {
	return boundary(async () => {
		mutation();
		const { viewer, db } = await self();
		if (!input.valid) throw new AuthFailure("invalid");
		const v = input.data,
			before = await own(db, v.id, viewer.id);
		if (revision(before) !== v.expectedRevision) throw new Failure("conflict");
		const write = writer(),
			tx = await write.createTransaction({ ttl: 60 });
		try {
			// Stage BEFORE the second live read. The staged write anchors Appwrite's
			// conflict detection; checking only before staging leaves a lost-update gap.
			const changed = await write.updateRow({
				databaseId: databaseId(),
				tableId: "posts",
				rowId: v.id,
				transactionId: tx.$id,
				data: {
					title: v.title,
					description: v.description,
					titleFolded: foldSearch(v.title),
					descriptionFolded: foldSearch(v.description),
					updatedAt: new Date(
						Math.max(Date.now(), Date.parse(String(before.updatedAt)) + 1),
					).toISOString(),
				},
			});
			const live = await own(db, v.id, viewer.id);
			if (revision(live) !== v.expectedRevision) throw new Failure("conflict");
			// Validate the response before committing; never replace ACLs/media/business dates.
			const value = ownPostDTO(changed, revision(changed));
			await write.updateTransaction({ transactionId: tx.$id, commit: true });
			return value;
		} catch (e) {
			try {
				await write.updateTransaction({
					transactionId: tx.$id,
					rollback: true,
				});
			} catch {}
			throw e;
		}
	});
}
