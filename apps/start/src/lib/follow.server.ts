import "@tanstack/react-start/server-only";
import { getCookie } from "@tanstack/react-start/server";
import {
	AppwriteException,
	ID,
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
	FollowChange,
	FollowEvent,
	FollowPage,
	FollowState,
} from "./follow-contract";
import type { FollowInput, FollowListInput } from "./follow-input";
import { publicProfile } from "./profile-contract";
import type { Validated } from "./profile-input";

function connection() {
	const databaseId = process.env.START_APPWRITE_DATABASE;
	if (!databaseId) throw new AuthFailure("unavailable");
	return { databaseId, db: new TablesDB(client(configuration())) };
}
function writer() {
	const key = process.env.START_APPWRITE_FOLLOW_WRITER_KEY;
	if (!key || key === configuration().key) throw new AuthFailure("unavailable");
	return new TablesDB(client(configuration()).setKey(key));
}
async function visible(id: string) {
	const { db, databaseId } = connection();
	try {
		const row = await db.getRow({ databaseId, tableId: "profiles", rowId: id });
		if (!row.isOnboarded) throw new AuthFailure("forbidden");
		return publicProfile(row);
	} catch (e) {
		if (e instanceof AppwriteException && [401, 403, 404].includes(e.code))
			throw new AuthFailure("forbidden");
		throw e;
	}
}
async function optionalIdentity() {
	if (!getCookie(configuration().cookie.name)) return null;
	try {
		return (await identity()).viewer.id;
	} catch (e) {
		if (e instanceof AuthFailure && e.reason === "unauthorized") return null;
		throw e;
	}
}
async function pair(actorId: string, targetId: string) {
	const { db, databaseId } = connection();
	const result = await db.listRows({
		databaseId,
		tableId: "follows",
		queries: [
			Query.equal("followerId", actorId),
			Query.equal("followingId", targetId),
			Query.select(["$id", "createdAt"]),
			Query.limit(1),
		],
		total: false,
	});
	return result.rows[0] ?? null;
}
async function state(
	targetId: string,
	viewerId: string | null,
): Promise<FollowState> {
	await visible(targetId);
	const { db, databaseId } = connection();
	const count = async (field: string) => {
		const result = await db.listRows({
			databaseId,
			tableId: "follows",
			queries: [
				Query.equal(field, targetId),
				Query.limit(1),
				Query.select(["$id"]),
			],
			total: true,
		});
		return result.total;
	};
	const [followers, followings, edge] = await Promise.all([
		count("followingId"),
		count("followerId"),
		viewerId ? pair(viewerId, targetId) : null,
	]);
	return { targetId, viewerId, following: !!edge, followers, followings };
}
export function readFollowState(input: Validated<{ id: string }>) {
	return boundary(async () => {
		if (!input.valid) throw new AuthFailure("invalid");
		return state(input.data.id, await optionalIdentity());
	});
}
function eventKind(following: boolean, edgeId: string) {
	return following
		? { type: "FOLLOW_CREATED" as const, eventId: `follow:${edgeId}` }
		: { type: "FOLLOW_REMOVED" as const, eventId: `unfollow:${edgeId}` };
}
function concurrentReplay(error: unknown, following: boolean) {
	return (
		error instanceof AppwriteException && error.code === (following ? 409 : 404)
	);
}
export function changeFollow(input: Validated<FollowInput>) {
	return boundary(async (): Promise<FollowChange> => {
		mutation();
		const { viewer } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const { id, following } = input.data;
		if (id === viewer.id) throw new AuthFailure("forbidden");
		await Promise.all([visible(id), visible(viewer.id)]);
		const { databaseId } = connection();
		const before = await pair(viewer.id, id);
		let event: FollowEvent | null = null;
		const occurredAt = new Date().toISOString();
		const edgeId = before?.$id ?? ID.unique();
		try {
			if (following && !before) {
				await writer().createRow({
					databaseId,
					tableId: "follows",
					rowId: edgeId,
					data: {
						followerId: viewer.id,
						followingId: id,
						createdAt: occurredAt,
						updatedAt: occurredAt,
					},
					permissions: [Permission.read(Role.any())],
				});
			} else if (!following && before) {
				await writer().deleteRow({
					databaseId,
					tableId: "follows",
					rowId: edgeId,
				});
			} else return { state: await state(id, viewer.id), event: null };
			event = {
				version: 1,
				...eventKind(following, edgeId),
				actorId: viewer.id,
				recipientId: id,
				edgeId,
				occurredAt,
			};
		} catch (e) {
			// Unique pair covers imported edges with arbitrary IDs as well as concurrent
			// creates. A missing delete was already applied by a concurrent request.
			if (!concurrentReplay(e, following)) throw e;
		}
		return { state: await state(id, viewer.id), event };
	});
}
export function readOwnFollows(input: Validated<FollowListInput>) {
	return boundary(async (): Promise<FollowPage> => {
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		const { direction, cursor } = input.data;
		const { databaseId } = connection();
		const field = direction === "following" ? "followerId" : "followingId";
		const other = direction === "following" ? "followingId" : "followerId";
		const queries = [
			Query.equal(field, viewer.id),
			Query.orderAsc("$id"),
			Query.limit(21),
			Query.select(["$id", other]),
		];
		if (cursor) queries.push(Query.greaterThan("$id", cursor));
		const result = await new TablesDB(sessionClient).listRows({
			databaseId,
			tableId: "follows",
			queries,
			total: false,
		});
		const rows = result.rows.slice(0, 20);
		const profiles = await Promise.all(
			rows.map(async (row) => {
				try {
					return await visible(String(row[other]));
				} catch (e) {
					if (e instanceof AuthFailure && e.reason === "forbidden") return null;
					throw e;
				}
			}),
		);
		return {
			viewerId: viewer.id,
			profiles: profiles.filter((p) => p !== null),
			nextCursor: result.rows.length > 20 ? (rows.at(-1)?.$id ?? null) : null,
		};
	});
}
