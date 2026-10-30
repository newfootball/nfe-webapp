import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import {
	AppwriteException,
	type Models,
	Permission,
	Query,
	Role,
	TablesDB,
} from "node-appwrite";
import {
	AuthFailure,
	client,
	configuration,
	identity,
	mutation,
	privateResponse,
} from "./auth-context.server";
import { foldSearch } from "./feed-input";
import {
	type ConversationPage,
	type MessagePage,
	type MessagePeer,
	type MessagingError,
	type MessagingResult,
	messageDTO,
	messageEvent,
} from "./messaging-contract";
import {
	type MessagePageInput,
	messageCursor,
	parseMessageCursor,
	type SendMessageInput,
} from "./messaging-input";
import type { Validated } from "./profile-input";

const fields = [
	"$id",
	"fromUserId",
	"toUserId",
	"content",
	"readAt",
	"createdAt",
	"updatedAt",
];
class Failure extends Error {
	constructor(readonly reason: MessagingError) {
		super(reason);
	}
}
async function boundary<T>(run: () => Promise<T>): Promise<MessagingResult<T>> {
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
		return { ok: false, error: "unavailable" };
	}
}
function databaseId() {
	const id = process.env.START_APPWRITE_DATABASE;
	if (!id) throw new Failure("unavailable");
	return id;
}
function writer() {
	const c = configuration(),
		key = process.env.START_APPWRITE_MESSAGING_WRITER_KEY;
	if (
		!key ||
		[
			c.key,
			process.env.START_APPWRITE_PROFILE_WRITER_KEY,
			process.env.START_APPWRITE_FEED_READER_KEY,
			process.env.START_APPWRITE_FOLLOW_WRITER_KEY,
			process.env.START_APPWRITE_POST_TEXT_WRITER_KEY,
		].includes(key)
	)
		throw new Failure("unavailable");
	return new TablesDB(client(c).setKey(key));
}
function ref(tableId: string, rowId: string) {
	return { databaseId: databaseId(), tableId, rowId };
}
async function optional(db: TablesDB, tableId: string, rowId: string) {
	try {
		return await db.getRow(ref(tableId, rowId));
	} catch (e) {
		if (e instanceof AppwriteException && [401, 403, 404].includes(e.code))
			return null;
		throw e;
	}
}
function hash(...values: string[]) {
	return createHash("sha256")
		.update(JSON.stringify(values))
		.digest("hex")
		.slice(0, 36);
}
export function conversationId(a: string, b: string) {
	return hash("conversation", ...[a, b].sort());
}
async function peer(db: TablesDB, id: string): Promise<MessagePeer> {
	const row = await optional(db, "profiles", id);
	if (!row || !row.isOnboarded) throw new Failure("forbidden");
	return { id, name: row.name, image: row.image };
}
function pairQueries(a: string, b: string) {
	return Query.or([
		Query.and([Query.equal("fromUserId", a), Query.equal("toUserId", b)]),
		Query.and([Query.equal("fromUserId", b), Query.equal("toUserId", a)]),
	]);
}
async function list(db: TablesDB, tableId: string, queries: string[]) {
	return db.listRows({
		databaseId: databaseId(),
		tableId,
		queries,
		total: false,
	});
}
async function allowed(db: TablesDB, actor: string, target: string) {
	if (actor === target) throw new Failure("forbidden");
	await Promise.all([peer(db, actor), peer(db, target)]);
	const prior = await list(db, "messages", [
		pairQueries(actor, target),
		Query.select(["$id"]),
		Query.limit(1),
	]);
	if (prior.rows.length) return;
	const follows = await list(db, "follows", [
		Query.or([
			Query.and([
				Query.equal("followerId", actor),
				Query.equal("followingId", target),
			]),
			Query.and([
				Query.equal("followerId", target),
				Query.equal("followingId", actor),
			]),
		]),
		Query.limit(1),
		Query.select(["$id"]),
	]);
	if (!follows.rows.length) throw new Failure("forbidden");
}
function pageQueries(
	input: MessagePageInput,
	owner: string,
	dateField: string,
) {
	let cursor: ReturnType<typeof parseMessageCursor>;
	try {
		cursor = parseMessageCursor(input, owner);
	} catch {
		throw new Failure("invalid");
	}
	const queries = [
		Query.orderDesc(dateField),
		Query.orderDesc("$id"),
		Query.limit(input.limit + 1),
	];
	if (cursor)
		queries.push(
			Query.or([
				Query.lessThan(dateField, cursor.time),
				Query.and([
					Query.equal(dateField, cursor.time),
					Query.lessThan("$id", cursor.id),
				]),
			]),
		);
	return queries;
}
export function readMessages(input: Validated<MessagePageInput>) {
	return boundary(async (): Promise<MessagePage> => {
		const { viewer, sessionClient } = await identity();
		if (!input.valid || !input.data.peerId || input.data.q)
			throw new Failure("invalid");
		const v = input.data,
			db = new TablesDB(sessionClient);
		const result = await list(db, "messages", [
			pairQueries(viewer.id, v.peerId as string),
			...pageQueries(v, viewer.id, "createdAt"),
			Query.select(fields),
		]);
		const messages = result.rows
				.slice(0, v.limit)
				.map((r) => messageDTO(r, viewer.id)),
			last = messages.at(-1);
		return {
			ownerId: viewer.id,
			messages,
			nextCursor:
				result.rows.length > v.limit && last
					? messageCursor(v, viewer.id, last.createdAt, last.id)
					: null,
		};
	});
}
export function readConversations(input: Validated<MessagePageInput>) {
	return boundary(async (): Promise<ConversationPage> => {
		const { viewer, sessionClient } = await identity();
		if (!input.valid || input.data.peerId || input.data.q)
			throw new Failure("invalid");
		const v = input.data,
			db = new TablesDB(sessionClient);
		const result = await list(db, "message_conversations", [
			Query.or([
				Query.equal("participantA", viewer.id),
				Query.equal("participantB", viewer.id),
			]),
			...pageQueries(v, viewer.id, "latestAt"),
		]);
		const rows = result.rows.slice(0, v.limit);
		const conversations = await Promise.all(
			rows.map(async (row) => {
				if (row.participantA !== viewer.id && row.participantB !== viewer.id)
					throw new Failure("forbidden");
				const peerId =
					row.participantA === viewer.id ? row.participantB : row.participantA;
				const latest = await db.getRow({
					...ref("messages", row.latestId),
					queries: [Query.select(fields)],
				});
				const unread = await db.listRows({
					databaseId: databaseId(),
					tableId: "messages",
					queries: [
						Query.equal("fromUserId", peerId),
						Query.equal("toUserId", viewer.id),
						Query.isNull("readAt"),
						Query.select(["$id"]),
						Query.limit(1),
					],
					total: true,
				});
				// Historical conversations remain readable even if a peer stops onboarding.
				const profile = await optional(db, "profiles", peerId);
				return {
					id: row.$id,
					peer: {
						id: peerId,
						name: profile?.name ?? null,
						image: profile?.image ?? null,
					},
					latest: messageDTO(latest, viewer.id),
					unread: unread.total,
				};
			}),
		);
		const last = rows.at(-1);
		return {
			ownerId: viewer.id,
			conversations,
			nextCursor:
				result.rows.length > v.limit && last
					? messageCursor(v, viewer.id, String(last.latestAt), last.$id)
					: null,
		};
	});
}
export function searchMessagePeers(input: Validated<{ q: string }>) {
	return boundary(async () => {
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new Failure("invalid");
		const db = new TablesDB(sessionClient);
		const result = await list(db, "profiles", [
			Query.equal("isOnboarded", true),
			Query.contains("nameFolded", foldSearch(input.data.q)),
			Query.orderAsc("nameFolded"),
			Query.orderAsc("$id"),
			Query.limit(10),
			Query.select(["$id", "name", "image"]),
		]);
		return {
			ownerId: viewer.id,
			peers: result.rows
				.filter((r) => r.$id !== viewer.id)
				.map((r) => ({
					id: r.$id,
					name: r.name as string | null,
					image: r.image as string | null,
				})),
		};
	});
}
function sameReplay(
	row: Models.DefaultRow,
	v: SendMessageInput,
	actor: string,
) {
	const message = messageDTO(row, actor);
	if (
		message.fromUserId !== actor ||
		message.toUserId !== v.toUserId ||
		message.content !== v.content
	)
		throw new Failure("conflict");
	return { ownerId: actor, message, event: messageEvent(message) };
}
export function sendPrivateMessage(input: Validated<SendMessageInput>) {
	return boundary(async () => {
		mutation();
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new Failure("invalid");
		const v = input.data,
			db = new TablesDB(sessionClient),
			write = writer();
		const id = hash("message", viewer.id, v.requestId),
			conversation = conversationId(viewer.id, v.toUserId);
		// Replays never consume quota or reset read state, even across window boundaries.
		const replay = await optional(db, "messages", id);
		if (replay) return sameReplay(replay, v, viewer.id);
		await allowed(db, viewer.id, v.toUserId);
		for (let attempt = 0; attempt < 4; attempt++) {
			const existing = await optional(db, "messages", id);
			if (existing) return sameReplay(existing, v, viewer.id);
			const window = Math.floor(Date.now() / 60_000),
				quotaId = hash("quota", viewer.id, String(window));
			const [quota, previous] = await Promise.all([
				optional(write, "message_limits", quotaId),
				optional(db, "message_conversations", conversation),
			]);
			if (quota && Number(quota.count) >= 20) throw new Failure("rateLimited");
			const tx = await write.createTransaction({ ttl: 60 }),
				transactionId = tx.$id;
			try {
				const quotaData = {
					senderId: viewer.id,
					window,
					count: Number(quota?.count ?? 0) + 1,
				};
				if (quota)
					await write.updateRow({
						...ref("message_limits", quotaId),
						data: quotaData,
						transactionId,
					});
				else
					await write.createRow({
						...ref("message_limits", quotaId),
						data: quotaData,
						permissions: [],
						transactionId,
					});
				// Anchor write BEFORE live recheck; commit conflicts cover later writers.
				const liveQuota = await optional(write, "message_limits", quotaId);
				if (Number(liveQuota?.count ?? 0) !== Number(quota?.count ?? 0))
					throw new Failure("conflict");
				const at = new Date(
					Math.max(
						Date.now(),
						Date.parse(String(previous?.latestAt ?? "1970-01-01")) + 1,
					),
				).toISOString();
				const permissions = [
					Permission.read(Role.user(viewer.id)),
					Permission.read(Role.user(v.toUserId)),
				];
				const row = await write.createRow({
					...ref("messages", id),
					data: {
						fromUserId: viewer.id,
						toUserId: v.toUserId,
						content: v.content,
						readAt: null,
						createdAt: at,
						updatedAt: at,
					},
					permissions,
					transactionId,
				});
				const [participantA, participantB] = [viewer.id, v.toUserId].sort();
				const data = { participantA, participantB, latestAt: at, latestId: id };
				if (previous)
					await write.updateRow({
						...ref("message_conversations", conversation),
						data,
						transactionId,
					});
				else
					await write.createRow({
						...ref("message_conversations", conversation),
						data,
						permissions,
						transactionId,
					});
				const live = await optional(db, "message_conversations", conversation);
				if (live?.latestId !== previous?.latestId)
					throw new Failure("conflict");
				const response = sameReplay(row, v, viewer.id);
				await write.updateTransaction({ transactionId, commit: true });
				return response;
			} catch (e) {
				try {
					await write.updateTransaction({ transactionId, rollback: true });
				} catch {}
				if (
					(e instanceof AppwriteException && e.code === 409) ||
					(e instanceof Failure && e.reason === "conflict")
				)
					continue;
				throw e;
			}
		}
		const replayAfterRace = await optional(db, "messages", id);
		if (replayAfterRace) return sameReplay(replayAfterRace, v, viewer.id);
		throw new Failure("conflict");
	});
}
export function markMessagesRead(input: Validated<{ ids: string[] }>) {
	return boundary(async () => {
		mutation();
		const { viewer, sessionClient } = await identity();
		if (!input.valid) throw new Failure("invalid");
		const db = new TablesDB(sessionClient),
			write = writer();
		// Validate ALL rows before starting any write; sender/admin cannot mark someone else's inbox.
		const rows = await Promise.all(
			[...new Set(input.data.ids)].map(async (id) => {
				const row = await optional(db, "messages", id);
				if (!row || row.toUserId !== viewer.id) throw new Failure("forbidden");
				return row;
			}),
		);
		const tx = await write.createTransaction({ ttl: 60 }),
			transactionId = tx.$id;
		try {
			for (const row of rows)
				if (!row.readAt)
					await write.updateRow({
						...ref("messages", row.$id),
						data: { readAt: new Date().toISOString() },
						transactionId,
					});
			await write.updateTransaction({ transactionId, commit: true });
		} catch (e) {
			try {
				await write.updateTransaction({ transactionId, rollback: true });
			} catch {}
			throw e;
		}
		return { ownerId: viewer.id, ids: rows.map((r) => r.$id) };
	});
}
