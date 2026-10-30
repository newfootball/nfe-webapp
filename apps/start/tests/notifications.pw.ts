import { readFile } from "node:fs/promises";
import { type APIResponse, expect, test } from "@playwright/test";
import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/notification-local";
import type { NotificationPage } from "../src/lib/notification-contract";
import {
	consumeNotifications,
	notificationTransaction,
	recoverNotification,
	stageNotification,
} from "../src/lib/notification-outbox.server";

const databaseId = "notifications-proof",
	origin = "http://127.0.0.1:3588";
if (
	process.env.NFE_NOTIFICATIONS_SYNTHETIC !== "1" ||
	process.env.START_APPWRITE_DATABASE !== databaseId ||
	process.env.START_APPWRITE_ENDPOINT !== endpoint
)
	throw new Error("Dedicated isolated proof required");
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; secret: string; password: string }[];
};
function actor(i: number) {
	const a = fixture.actors[i];
	if (!a) throw new Error("Missing actor");
	return a;
}
const a = actor(0),
	b = actor(1),
	admin = actor(2);
const base = () => new Client().setEndpoint(endpoint).setProject(c.project);
const db = new TablesDB(base().setKey(c.proofKey));
const secrets = [
	c.proofKey,
	c.notificationKey,
	c.writerKey,
	c.readerKey,
	c.sessionKey,
	...fixture.actors.flatMap((x) => [x.secret, x.password]),
	"CONFIDENTIAL-NOTIFICATIONS-PROFILE",
];
const headers = (secret = b.secret, extra: Record<string, string> = {}) => ({
	"x-tsr-serverfn": "true",
	"content-type": "application/json",
	Accept: "application/json",
	Origin: origin,
	"sec-fetch-site": "same-origin",
	Cookie: secret ? `nfe-session-dev=${secret}` : "",
	...extra,
});
async function result<T>(r: APIResponse): Promise<T> {
	expect(r.status()).toBe(200);
	expect(r.headers()["cache-control"]).toBe("private, no-store");
	const raw = await r.text();
	for (const s of secrets) expect(raw).not.toContain(s);
	const envelope = fromCrossJSON(JSON.parse(raw), {}) as {
		result: T;
		error?: unknown;
	};
	expect(envelope.error).toBeUndefined();
	return envelope.result;
}
async function rows(tableId: string) {
	return db.listRows({
		databaseId,
		tableId,
		queries: [Query.limit(100)],
		total: true,
	});
}
type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

test("atomic producers, crash/replay, SDK/RPC privacy, pagination, FR/EN, read badge and identity cancellation", async ({
	page,
	context,
	request,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: a.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto("/en/post/social-public");
	await page
		.getByTestId("social-interactions")
		.getByRole("button", { name: "Like", exact: true })
		.click();
	await expect(
		page
			.getByTestId("social-interactions")
			.getByRole("button", { name: "Unlike", exact: true }),
	).toBeEnabled();
	const business = await rows("likes"),
		staged = await rows("notification_outbox_v1");
	expect(
		business.rows.some(
			(r) => r.userId === a.id && r.postId === "social-public",
		),
	).toBe(true);
	expect(staged.total).toBe(1);
	expect((await rows("notifications_v1")).total).toBe(0);
	// The business request has completed and the producer process can stop here.
	// A separate explicit consumer recovers durable state, never the RPC return value.
	const [pass1, pass2] = await Promise.all([
		consumeNotifications(),
		consumeNotifications(),
	]);
	expect(pass1.delivered + pass2.delivered).toBe(1);
	expect((await rows("notifications_v1")).total).toBe(1);
	const first = (await rows("notifications_v1")).rows[0];
	if (!first) throw new Error("Delivery missing");
	expect(first.type).toBe("LIKE");
	expect(first.actorId).toBe(a.id);
	expect(first.recipientId).toBe(b.id);
	for (const secret of ["", a.secret, admin.secret]) {
		const sdk = new TablesDB(secret ? base().setSession(secret) : base());
		expect(
			(await sdk.listRows({ databaseId, tableId: "notifications_v1" })).total,
		).toBe(0);
		await expect(
			sdk.getRow({ databaseId, tableId: "notifications_v1", rowId: first.$id }),
		).rejects.toBeDefined();
		await expect(
			sdk.listRows({ databaseId, tableId: "notification_outbox_v1" }),
		).resolves.toMatchObject({ total: 0 });
	}
	const recipient = new TablesDB(base().setSession(b.secret));
	expect(
		(await recipient.listRows({ databaseId, tableId: "notifications_v1" }))
			.total,
	).toBe(1);
	await expect(
		recipient.updateRow({
			databaseId,
			tableId: "notifications_v1",
			rowId: first.$id,
			data: { recipientId: a.id },
		}),
	).rejects.toBeDefined();
	await context.clearCookies();
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: b.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	const capture = page.waitForRequest(
		(r) =>
			r.url().includes("/_serverFn/") &&
			r.method() === "GET" &&
			decodeURIComponent(r.url()).includes("cursor"),
	);
	await page.goto("/en/notifications");
	const listUrl = (await capture).url();
	await expect(page.getByTestId("notification-item")).toHaveCount(1);
	await expect(page.getByTestId("notification-item")).toContainText(
		"liked your post",
	);
	const list = async (
		secret: string,
		viewerId = b.id,
		cursor: string | null = null,
	) => {
		const url = new URL(listUrl);
		url.searchParams.set(
			"payload",
			JSON.stringify(toJSON({ data: { viewerId, cursor } })),
		);
		return result<Reply<NotificationPage>>(
			await request.get(url.href, { headers: headers(secret) }),
		);
	};
	expect(await list("")).toMatchObject({ ok: false, error: "unauthorized" });
	for (const actor of [a, admin]) {
		expect(await list(actor.secret)).toMatchObject({
			ok: false,
			error: "forbidden",
		});
		expect(await list(actor.secret, actor.id)).toMatchObject({
			ok: true,
			value: { notifications: [], unread: 0 },
		});
	}
	const markCapture = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await page.getByRole("button", { name: "Mark as read", exact: true }).click();
	const markUrl = (await markCapture).url();
	await expect(page.getByTestId("notification-badge")).toHaveText("Unread: 0");
	const mark = async (
		data: unknown,
		secret = b.secret,
		extra: Record<string, string> = {},
	) =>
		result<Reply<unknown>>(
			await request.post(markUrl, {
				headers: headers(secret, extra),
				data: JSON.stringify(toJSON({ data })),
			}),
		);
	for (const Origin of ["", "null", "https://evil.example"]) {
		expect(
			await mark({ viewerId: b.id, mode: "all" }, b.secret, { Origin }),
		).toMatchObject({ ok: false, error: "origin" });
	}
	expect(await mark({ viewerId: b.id, mode: "all" }, a.secret)).toMatchObject({
		ok: false,
		error: "forbidden",
	});
	expect(
		await mark({ viewerId: b.id, mode: "all", recipientId: a.id }),
	).toMatchObject({ ok: false, error: "invalid" });
	expect(
		await mark({ viewerId: b.id, mode: "one", id: first.$id }, admin.secret),
	).toMatchObject({ ok: false, error: "forbidden" });
	const readAt = (
		await db.getRow({
			databaseId,
			tableId: "notifications_v1",
			rowId: first.$id,
		})
	).readAt;
	// Recovery from an already-created notification awaiting ack: do not reset readAt.
	await db.updateRow({
		databaseId,
		tableId: "notification_outbox_v1",
		rowId: first.$id,
		data: {
			status: "PENDING",
			claim: null,
			leaseUntil: null,
			nextAttemptAt: new Date().toISOString(),
		},
	});
	await consumeNotifications();
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notifications_v1",
				rowId: first.$id,
			})
		).readAt,
	).toBe(readAt);
	expect((await rows("notifications_v1")).total).toBe(1);
	// Bounded exhaustion and journaled operator recovery of a durable business event.
	await db.updateRow({
		databaseId,
		tableId: "notification_outbox_v1",
		rowId: first.$id,
		data: {
			status: "PENDING",
			attempts: 5,
			nextAttemptAt: new Date().toISOString(),
		},
	});
	await consumeNotifications();
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notification_outbox_v1",
				rowId: first.$id,
			})
		).status,
	).toBe("FAILED");
	await recoverNotification(first.$id, "Synthetic recovery proof");
	await consumeNotifications();
	expect((await rows("notification_recovery_v1")).total).toBe(1);
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notifications_v1",
				rowId: first.$id,
			})
		).readAt,
	).toBe(readAt);
	for (let i = 0; i < 25; i++)
		await notificationTransaction(db, (transactionId) =>
			stageNotification(transactionId, {
				version: 1,
				eventId: `synthetic-follow:${i}`,
				type: "FOLLOW",
				actorId: a.id,
				recipientId: b.id,
				targetId: a.id,
				entityId: `imported-edge-${i}`,
				occurredAt: "2026-10-30T11:00:00.000Z",
			}),
		);
	await consumeNotifications();
	await consumeNotifications();
	const one = await list(b.secret);
	if (!one.ok) throw new Error("List denied");
	expect(one.value.notifications).toHaveLength(20);
	expect(one.value.unread).toBe(25);
	expect(one.value.nextCursor).not.toBeNull();
	const two = await list(b.secret, b.id, one.value.nextCursor);
	if (!two.ok) throw new Error("Next denied");
	expect(two.value.notifications).toHaveLength(6);
	expect(
		new Set(
			[...one.value.notifications, ...two.value.notifications].map((x) => x.id),
		).size,
	).toBe(26);
	expect(await list(a.secret, a.id, one.value.nextCursor)).toMatchObject({
		ok: false,
		error: "invalid",
	});
	await page.goto("/fr/notifications");
	await expect(
		page.getByRole("heading", { name: "Notifications", exact: true }),
	).toBeVisible();
	await expect(
		page
			.getByTestId("notification-item")
			.filter({ hasText: "vous suit" })
			.first(),
	).toContainText("vous suit");
	await page
		.getByRole("button", { name: "Tout marquer comme lu", exact: true })
		.click();
	await expect(page.getByTestId("notification-badge")).toHaveText(
		"Non lues: 0",
	);
	// Fresh keyless target checks suppress linking even for recipient/admin-readable archives.
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "social-public",
		data: { status: "ARCHIVED" },
		permissions: [
			Permission.read(Role.user(b.id)),
			Permission.read(Role.label("admin")),
		],
	});
	const hidden = await list(b.secret);
	if (!hidden.ok) throw new Error("List denied");
	const later = hidden.value.nextCursor
		? await list(b.secret, b.id, hidden.value.nextCursor)
		: hidden;
	if (!later.ok) throw new Error("Page denied");
	expect(
		[...hidden.value.notifications, ...later.value.notifications].find(
			(n) => n.id === first.$id,
		)?.target.available,
	).toBe(false);
	// SPA signout performs the shared cancellation+clear, then the next account stays empty.
	await page.locator('a[href="/fr/private"]').click();
	await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
	await page.locator('input[name="email"]').fill(`${a.id}@example.test`);
	await page.locator('input[name="password"]').fill(a.password);
	await page
		.locator("form")
		.filter({ has: page.locator('input[name="email"]') })
		.getByRole("button", { name: "Connexion", exact: true })
		.click();
	await expect(page.getByTestId("identity")).toHaveText(a.id);
	await page.locator('a[href="/fr/notifications"]').click();
	await expect(page.getByTestId("notification-item")).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("COMMENT and FOLLOW business producers stage once and preserve imported pair IDs", async ({
	page,
	context,
	request,
}) => {
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "social-public",
		data: { status: "PUBLISHED" },
		permissions: [Permission.read(Role.any())],
	});
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: a.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto("/en/post/social-public");
	const panel = page.getByTestId("social-interactions");
	await panel.getByRole("button", { name: "Comments", exact: true }).click();
	await panel.getByLabel("Your comment").fill("Synthetic notification comment");
	const capture = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await panel.getByRole("button", { name: "Comment", exact: true }).click();
	const post = await capture;
	await expect(
		panel.getByText("Synthetic notification comment", { exact: true }),
	).toBeVisible();
	await expect(
		panel.getByRole("button", { name: "Comment", exact: true }),
	).toBeEnabled();
	// Exact repeated request uses the original client idempotency token.
	expect(
		await result(
			await request.post(post.url(), {
				headers: headers(a.secret),
				data: post.postData() ?? "",
			}),
		),
	).toMatchObject({ ok: true });
	const comments = await rows("comments");
	expect(comments.rows.filter((r) => r.userId === a.id)).toHaveLength(1);
	const events = await rows("notification_outbox_v1");
	expect(events.rows.filter((r) => r.type === "COMMENT")).toHaveLength(1);
	const timestamp = new Date().toISOString();
	await db.createRow({
		databaseId,
		tableId: "follows",
		rowId: "arbitrary-imported-follow",
		data: {
			followerId: a.id,
			followingId: b.id,
			createdAt: timestamp,
			updatedAt: timestamp,
		},
		permissions: [Permission.read(Role.any())],
	});
	await page.goto(`/en/user/${b.id}`);
	await expect(
		page.getByRole("button", { name: "Unfollow", exact: true }),
	).toBeEnabled();
	const followCapture = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await page.getByRole("button", { name: "Unfollow", exact: true }).click();
	const followUrl = (await followCapture).url();
	await expect(
		page.getByRole("button", { name: "Follow", exact: true }),
	).toBeEnabled();
	// Concurrent requests are real RPCs and unique pair arbitration remains authoritative.
	const repeated = await Promise.all([
		request.post(followUrl, {
			headers: headers(a.secret),
			data: JSON.stringify(toJSON({ data: { id: b.id, following: true } })),
		}),
		request.post(followUrl, {
			headers: headers(a.secret),
			data: JSON.stringify(toJSON({ data: { id: b.id, following: true } })),
		}),
	]);
	for (const response of repeated)
		expect(await result(response)).toMatchObject({ ok: true });
	const edges = await rows("follows");
	expect(
		edges.rows.filter((r) => r.followerId === a.id && r.followingId === b.id),
	).toHaveLength(1);
	expect(
		(await rows("notification_outbox_v1")).rows.filter(
			(r) => r.type === "FOLLOW" && String(r.eventId).startsWith("follow:"),
		),
	).toHaveLength(1);
	await consumeNotifications();
	expect(
		(await rows("notifications_v1")).rows.some((r) => r.type === "COMMENT"),
	).toBe(true);
});
