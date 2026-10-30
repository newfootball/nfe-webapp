import { readdir, readFile } from "node:fs/promises";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { Client, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { databaseId, type Fixture } from "../scripts/messaging-fixtures";
import { endpoint, state } from "../scripts/messaging-local";
import type {
	ConversationPage,
	MessagePage,
	MessagingResult,
	PrivateMessage,
} from "../src/lib/messaging-contract";

const origin = "http://127.0.0.1:3590";
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(
	await readFile(`${state}/fixture.json`, "utf8"),
) as Fixture;
const admin = new TablesDB(
	new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
);
const secrets = [
	c.proofKey,
	c.messagingWriterKey,
	c.sessionKey,
	c.writerKey,
	c.readerKey,
	...fixture.actors.flatMap((a) => [a.password, a.secret]),
];
const ids = new Map<string, string>();
async function rpcURL(name: string) {
	if (!ids.has(name))
		for (const file of await readdir(
			`${import.meta.dir}/../dist/server/assets`,
		)) {
			const text = await readFile(
					`${import.meta.dir}/../dist/server/assets/${file}`,
					"utf8",
				),
				start = text.indexOf(`var ${name} = createServerFn(`);
			const m =
				start < 0
					? null
					: text.slice(start).match(/createSsrRpc\("([a-f0-9]+)"/);
			if (m) {
				ids.set(name, m[1]!);
				break;
			}
		}
	if (!ids.has(name)) throw new Error(`Missing RPC ${name}`);
	return `${origin}/_serverFn/${ids.get(name)}`;
}
function noLeaks(text: string) {
	for (const secret of secrets) expect(text.includes(secret)).toBe(false);
}
async function call<T>(
	request: APIRequestContext,
	name: string,
	data: unknown,
	actor = -1,
	method = "GET",
	badOrigin = false,
): Promise<MessagingResult<T>> {
	const url = new URL(await rpcURL(name)),
		payload = JSON.stringify(toJSON({ data }));
	if (method === "GET") url.searchParams.set("payload", payload);
	const r = await request.fetch(url.toString(), {
		method,
		headers: {
			"x-tsr-serverfn": "true",
			Origin: badOrigin ? "https://evil.test" : origin,
			"sec-fetch-site": "same-origin",
			Accept: "application/json",
			Cookie:
				actor < 0 ? "" : `nfe-session-dev=${fixture.actors[actor]!.secret}`,
			...(method === "POST" ? { "Content-Type": "application/json" } : {}),
		},
		...(method === "POST" ? { data: payload } : {}),
	});
	const text = await r.text();
	noLeaks(text);
	expect(r.headers()["cache-control"]).toBe("private, no-store");
	return (fromCrossJSON(JSON.parse(text), {}) as { result: MessagingResult<T> })
		.result;
}
function value<T>(r: MessagingResult<T>): T {
	expect(r.ok).toBe(true);
	if (!r.ok) throw new Error(r.error);
	return r.value;
}
const history = (
	request: APIRequestContext,
	actor = 0,
	peerId = "actor-B",
	cursor: string | null = null,
) => call<MessagePage>(request, "getMessageHistory", { peerId, cursor }, actor);
const send = (
	request: APIRequestContext,
	actor: number,
	toUserId: string,
	content: string,
	requestId = crypto.randomUUID(),
) =>
	call<{
		ownerId: string;
		message: PrivateMessage;
		event: { eventId: string; type: string };
	}>(request, "sendMessage", { toUserId, content, requestId }, actor, "POST");
async function retrySend(
	request: APIRequestContext,
	actor: number,
	toUserId: string,
	content: string,
	requestId = crypto.randomUUID(),
) {
	for (let attempt = 0; attempt < 8; attempt++) {
		const r = await send(request, actor, toUserId, content, requestId);
		if (r.ok || r.error !== "conflict") return r;
	}
	throw new Error("Send race did not settle");
}
function sessionDB(actor: number) {
	return new TablesDB(
		new Client()
			.setEndpoint(endpoint)
			.setProject(c.project)
			.setSession(fixture.actors[actor]!.secret),
	);
}

test("participant confidentiality, imported history/list pagination, durable policy and read state", async ({
	request,
}) => {
	for (const actor of [-1, 2, 3]) {
		const r = await history(request, actor);
		if (actor === -1) expect(r).toEqual({ ok: false, error: "unauthorized" });
		else expect(value(r).messages).toEqual([]);
		const db =
			actor < 0
				? new TablesDB(new Client().setEndpoint(endpoint).setProject(c.project))
				: sessionDB(actor);
		await expect(
			db.getRow({ databaseId, tableId: "messages", rowId: fixture.ids[0]! }),
		).rejects.toMatchObject({ code: expect.any(Number) });
		const direct = await db.listRows({ databaseId, tableId: "messages" });
		expect(direct.rows).toHaveLength(0);
		await expect(
			db.getRow({ databaseId, tableId: "message_limits", rowId: "anything" }),
		).rejects.toBeDefined();
	}
	await expect(
		sessionDB(0).updateRow({
			databaseId,
			tableId: "messages",
			rowId: fixture.ids[0]!,
			data: { content: "SDK attack" },
		}),
	).rejects.toBeDefined();
	await expect(
		sessionDB(0).createRow({
			databaseId,
			tableId: "messages",
			rowId: "sdk-attack",
			data: {},
		}),
	).rejects.toBeDefined();
	let cursor: string | null = null;
	const all: PrivateMessage[] = [];
	do {
		const page: MessagePage = value(
			await history(request, 0, "actor-B", cursor),
		);
		all.push(...page.messages);
		cursor = page.nextCursor;
	} while (cursor);
	expect(all).toHaveLength(45);
	expect(new Set(all.map((m) => m.id)).size).toBe(45);
	expect(all.every((m) => m.createdAt === "1998-07-12T12:34:56.123Z")).toBe(
		true,
	);
	const first = value(await history(request));
	expect(await history(request, 1, "actor-A", first.nextCursor)).toEqual({
		ok: false,
		error: "invalid",
	});
	const conversations = [];
	cursor = null;
	do {
		const page: ConversationPage = value(
			await call<ConversationPage>(request, "getConversations", { cursor }, 0),
		);
		conversations.push(...page.conversations);
		cursor = page.nextCursor;
	} while (cursor);
	expect(conversations).toHaveLength(24);
	expect(new Set(conversations.map((c) => c.id)).size).toBe(24);
	expect(conversations.find((c) => c.peer.id === "actor-B")?.unread).toBe(23);
	const search = value(
		await call<{ peers: { id: string }[] }>(
			request,
			"findMessagePeers",
			{ q: "actor-" },
			0,
		),
	);
	expect(search.peers.some((p) => p.id === "actor-B")).toBe(true);
	for (const target of ["missing", "actor-A", "actor-C", "actor-incomplete"])
		expect(await send(request, 0, target, "blocked")).toEqual({
			ok: false,
			error: "forbidden",
		});
	expect(
		await call(
			request,
			"sendMessage",
			{
				toUserId: "actor-B",
				content: "x".repeat(2001),
				requestId: crypto.randomUUID(),
			},
			0,
			"POST",
		),
	).toEqual({ ok: false, error: "invalid" });
	expect(
		await call(
			request,
			"sendMessage",
			{
				toUserId: "actor-B",
				content: "ok",
				requestId: crypto.randomUUID(),
				fromUserId: "actor-C",
			},
			0,
			"POST",
		),
	).toEqual({ ok: false, error: "invalid" });
	expect(
		await call(
			request,
			"sendMessage",
			{ toUserId: "actor-B", content: "ok", requestId: crypto.randomUUID() },
			0,
			"POST",
			true,
		),
	).toEqual({ ok: false, error: "origin" });
	const opening = value(
		await send(request, 1, "actor-C", "One-way follow opens conversation"),
	);
	expect(opening.event.type).toBe("MESSAGE");
	const received = all.filter((m) => m.toUserId === "actor-A").map((m) => m.id);
	for (const actor of [1, 2, 3, -1]) {
		const r = await call(
			request,
			"markRead",
			{ ids: [received[0]] },
			actor,
			"POST",
		);
		expect(r.ok).toBe(false);
	}
	// Mark-read only touches explicit received IDs; simultaneous later incoming message remains unread.
	const [marked, arriving] = await Promise.all([
		call(request, "markRead", { ids: received }, 0, "POST"),
		retrySend(request, 1, "actor-A", "Incoming during mark read"),
	]);
	expect(marked.ok).toBe(true);
	const incoming = value(arriving).message;
	expect(
		(
			await admin.getRow({
				databaseId,
				tableId: "messages",
				rowId: incoming.id,
			})
		).readAt,
	).toBeNull();
	const reread = value(await history(request));
	expect(reread.messages.find((m) => m.id === incoming.id)?.readAt).toBeNull();
	expect(
		(
			await admin.getRow({
				databaseId,
				tableId: "messages",
				rowId: received[0]!,
			})
		).readAt,
	).not.toBeNull();
});

test("idempotent races/retries and persistent sender quota", async ({
	request,
}) => {
	const requestId = crypto.randomUUID();
	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			retrySend(request, 0, "actor-B", "Exactly once", requestId),
		),
	);
	const messages = results.map((r) => value(r).message);
	expect(new Set(messages.map((m) => m.id)).size).toBe(1);
	const replay = value(
		await send(request, 0, "actor-B", "Exactly once", requestId),
	);
	expect(replay.message.id).toBe(messages[0]!.id);
	expect(
		await send(request, 0, "actor-B", "Different payload", requestId),
	).toEqual({ ok: false, error: "conflict" });
	const unique = await Promise.all(
		Array.from({ length: 4 }, (_, i) =>
			retrySend(request, 0, "actor-B", `Concurrent unique ${i}`),
		),
	);
	expect(new Set(unique.map((r) => value(r).message.id)).size).toBe(4);
	// C has not sent before; counts survive independent RPCs and consume only committed sends.
	if (Date.now() % 60_000 > 45_000)
		await new Promise((resolve) =>
			setTimeout(resolve, 60_000 - (Date.now() % 60_000) + 50),
		);
	const tokens = Array.from({ length: 20 }, () => crypto.randomUUID());
	for (let i = 0; i < 20; i++)
		expect(
			(await retrySend(request, 2, "actor-B", `Quota ${i}`, tokens[i])).ok,
		).toBe(true);
	expect(await send(request, 2, "actor-B", "Over quota")).toEqual({
		ok: false,
		error: "rateLimited",
	});
	expect((await send(request, 2, "actor-B", "Quota 0", tokens[0])).ok).toBe(
		true,
	);
	// A separate fresh session still sees the same server-side limit.
	const quota = await admin.listRows({ databaseId, tableId: "message_limits" });
	expect(quota.rows.find((r) => r.senderId === "actor-C")?.count).toBe(20);
});

test("FR/EN history reload, optimistic rollback and delayed SPA account switch", async ({
	page,
	context,
}) => {
	await context.addCookies([
		{ name: "nfe-session-dev", value: fixture.actors[0]!.secret, url: origin },
	]);
	await page.goto("/fr/messages/actor-B");
	await expect(
		page.getByRole("heading", { name: "Messages", exact: true }),
	).toBeVisible();
	for (
		let pageNumber = 0;
		pageNumber < 3 &&
		(await page.getByRole("button", { name: "Charger la suite" }).isVisible());
		pageNumber++
	)
		await page.getByRole("button", { name: "Charger la suite" }).click();
	await expect(
		page.getByText("Imported history 0", { exact: true }),
	).toBeVisible();
	await page.reload();
	await expect(page.getByText("Exactly once", { exact: true })).toBeVisible();
	await page.goto("/en/messages/actor-C");
	await page.getByLabel("Your message").fill("Rollback denied opening");
	await page.getByRole("button", { name: "Send", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("not allowed");
	await expect(page.locator('[data-message-id^="pending-"]')).toHaveCount(0);
	await expect(page.getByLabel("Your message")).toHaveValue(
		"Rollback denied opening",
	);
	await page.goto("/en/messages/actor-B");
	await expect(page.getByText("Exactly once", { exact: true })).toBeVisible();
	let release: () => void = () => {};
	let intercepted: () => void = () => {};
	const ready = new Promise<void>((resolve) => {
			intercepted = resolve;
		}),
		hold = new Promise<void>((resolve) => {
			release = resolve;
		});
	await page.route(`${await rpcURL("getMessageHistory")}*`, async (route) => {
		const response = await route.fetch();
		intercepted();
		await hold;
		await route.fulfill({ response });
	});
	await page.evaluate(() => {
		(window as unknown as { messagingSpaMarker: string }).messagingSpaMarker =
			"preserved";
	});
	await page.getByRole("button", { name: "Refresh", exact: true }).click();
	await ready;
	// SPA sign-out and sign-in must clear queries while A's old RPC remains delayed.
	await page.getByRole("link", { name: "My space", exact: true }).click();
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await page
		.getByLabel("Email", { exact: true })
		.fill(fixture.actors[2]!.email);
	await page
		.getByLabel("Password", { exact: true })
		.fill(fixture.actors[2]!.password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await page.waitForURL("**/en/private");
	release();
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { messagingSpaMarker: string })
					.messagingSpaMarker,
		),
	).toBe("preserved");
	await page.unrouteAll({ behavior: "wait" });
	await page.getByRole("link", { name: "Messages", exact: true }).click();
	await expect(page.getByText("Exactly once", { exact: true })).toHaveCount(0);
	await expect(
		page.getByText("Imported history 44", { exact: true }),
	).toHaveCount(0);
	noLeaks(await page.content());
});
