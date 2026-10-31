import { spawn } from "node:child_process";
import { chmod, open, readdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { type APIResponse, expect, test } from "@playwright/test";
import type { QueryClient } from "@tanstack/react-query";
import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/notification-local";
import type { NotificationPage } from "../src/lib/notification-contract";
import { legacyNotification } from "../src/lib/notification-contract";
import { formatNotificationDate } from "../src/lib/notification-messages";
import {
	consumeNotifications,
	notificationTransaction,
	recoverNotification,
	stageLegacyNotification,
	stageNotification,
} from "../src/lib/notification-outbox.server";

const databaseId = "notifications-proof",
	origin = "http://127.0.0.1:3588";
if (
	process.env.NFE_NOTIFICATIONS_SYNTHETIC !== "1" ||
	process.env.START_APPWRITE_DATABASE !== databaseId ||
	process.env.START_APPWRITE_ENDPOINT !==
		process.env.NFE_NOTIFICATION_PROXY_ENDPOINT
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
	process.env.NFE_NOTIFICATION_PROXY_TOKEN ?? "proxy-token-not-set",
	c.proofKey,
	c.notificationKey,
	c.messagingKey,
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

async function control(data?: { failStage?: boolean; recipient?: string }) {
	const url = process.env.NFE_NOTIFICATION_PROXY_CONTROL,
		token = process.env.NFE_NOTIFICATION_PROXY_TOKEN;
	if (!url || !token) throw new Error("Runner proxy required");
	const r = await fetch(url, {
		method: data ? "POST" : "DELETE",
		headers: { "x-proof-token": token, "content-type": "application/json" },
		body: data ? JSON.stringify(data) : undefined,
	});
	expect(r.ok).toBe(true);
}
async function fault(phase: "claim" | "fence" | "ack") {
	const nonce = crypto.randomUUID(),
		path = `${state}/fault-${nonce}.json`;
	const log = await open(`${state}/fault-${nonce}.log`, "w", 0o600);
	let spawnError: Error | undefined;
	const child = spawn(
		"bun",
		["scripts/notification-fault-worker.ts", phase, nonce],
		{
			cwd: fileURLToPath(new URL("../", import.meta.url)),
			env: process.env,
			stdio: ["ignore", log.fd, log.fd],
		},
	);
	const exited = new Promise<void>((resolve) => {
		child.once("error", (error) => {
			spawnError = error;
			resolve();
		});
		child.once("close", () => resolve());
	});
	await log.close();
	try {
		for (let i = 0; i < 250; i++) {
			try {
				const journal = JSON.parse(await readFile(path, "utf8")) as {
					rowId: string;
					claim: string;
					leaseUntil: string;
					transactionId: string | null;
				};
				return { child, exited, journal };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			if (spawnError) throw spawnError;
			if (child.exitCode !== null || child.signalCode !== null)
				throw new Error("Fault child exited before boundary");
			await sleep(100);
		}
		throw new Error("Fault boundary timeout");
	} catch (e) {
		child.kill("SIGKILL");
		await exited;
		throw e;
	}
}
async function killFault(f: Awaited<ReturnType<typeof fault>>) {
	f.child.kill("SIGKILL");
	await f.exited;
	expect(f.child.signalCode).toBe("SIGKILL");
	if (f.journal.transactionId)
		await db.updateTransaction({
			transactionId: f.journal.transactionId,
			rollback: true,
		});
}
async function expire(id: string) {
	await db.updateRow({
		databaseId,
		tableId: "notification_outbox_v1",
		rowId: id,
		data: { leaseUntil: "2026-01-01T00:00:00.000Z" },
	});
}
async function stage(label: string, recipientId = a.id) {
	const event = {
		version: 1 as const,
		eventId: `proof:${label}`,
		type: "FOLLOW" as const,
		actorId: admin.id,
		recipientId,
		targetId: admin.id,
		entityId: label,
		occurredAt: new Date().toISOString(),
	};
	await notificationTransaction(db, (tx) => stageNotification(tx, event));
	const row = (await rows("notification_outbox_v1")).rows.find(
		(r) => r.eventId === event.eventId,
	);
	if (!row) throw new Error("Staged event missing");
	return row.$id;
}

test("real staging rollback, process death, transactional create/ack rollback and fenced reclaim", async ({
	page,
	context,
}) => {
	const proof: Record<string, unknown> = {};
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: admin.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto("/en/post/social-public");
	const panel = page.getByTestId("social-interactions");
	await control({ failStage: true });
	try {
		await panel.getByRole("button", { name: "Like", exact: true }).click();
		await expect(panel.getByRole("alert")).toBeVisible();
		expect(
			(await rows("likes")).rows.filter((r) => r.userId === admin.id),
		).toHaveLength(0);
		expect(
			(await rows("notification_outbox_v1")).rows.filter(
				(r) => r.type === "LIKE" && r.actorId === admin.id,
			),
		).toHaveLength(0);
		proof.stageRollback = true;
	} finally {
		await control();
	}
	await panel.getByRole("button", { name: "Like", exact: true }).click();
	await expect(
		panel.getByRole("button", { name: "Unlike", exact: true }),
	).toBeEnabled();
	const claimed = await fault("claim");
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notification_outbox_v1",
				rowId: claimed.journal.rowId,
			})
		).claim,
	).toBe(claimed.journal.claim);
	await killFault(claimed);
	// One actual wall-clock expiry, not an edited status pretending to be a crash.
	while (Date.parse(claimed.journal.leaseUntil) >= Date.now()) await sleep(250);
	await consumeNotifications();
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notification_outbox_v1",
				rowId: claimed.journal.rowId,
			})
		).status,
	).toBe("DELIVERED");
	proof.killedAfterBusinessCommitAndClaim = {
		signal: "SIGKILL",
		realLeaseExpired: true,
	};
	const freshId = await stage("create-crash");
	const created = await fault("ack");
	expect(created.journal.rowId).toBe(freshId);
	await expect(
		db.getRow({ databaseId, tableId: "notifications_v1", rowId: freshId }),
	).rejects.toBeDefined();
	await killFault(created);
	await expect(
		db.getRow({ databaseId, tableId: "notifications_v1", rowId: freshId }),
	).rejects.toBeDefined();
	await expire(freshId);
	await consumeNotifications();
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notification_outbox_v1",
				rowId: freshId,
			})
		).status,
	).toBe("DELIVERED");
	proof.killedAfterStagedCreateBeforeAck = {
		signal: "SIGKILL",
		transactionRolledBack: true,
	};
	// An audited prior receipt is a separate recovery fixture; current create+ack is atomic.
	const receiptId = await stage("read-receipt"),
		receipt = await db.getRow({
			databaseId,
			tableId: "notification_outbox_v1",
			rowId: receiptId,
		}),
		readAt = new Date().toISOString();
	await db.createRow({
		databaseId,
		tableId: "notifications_v1",
		rowId: receiptId,
		data: {
			eventId: receipt.eventId,
			type: receipt.type,
			actorId: receipt.actorId,
			recipientId: receipt.recipientId,
			targetId: receipt.targetId,
			entityId: receipt.entityId,
			occurredAt: receipt.occurredAt,
			source: receipt.source,
			readAt,
		},
		permissions: [Permission.read(Role.user(a.id))],
	});
	const expectedReadAt = (
		await db.getRow({
			databaseId,
			tableId: "notifications_v1",
			rowId: receiptId,
		})
	).readAt;
	const ack = await fault("ack");
	expect(ack.journal.rowId).toBe(receiptId);
	await killFault(ack);
	await expire(receiptId);
	await consumeNotifications();
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notifications_v1",
				rowId: receiptId,
			})
		).readAt,
	).toBe(expectedReadAt);
	proof.priorReadReceiptSurvivedKilledAck = true;
	const staleId = await stage("stale-fence");
	let reached!: () => void, resume!: () => void;
	const hit = new Promise<void>((r) => {
			reached = r;
		}),
		hold = new Promise<void>((r) => {
			resume = r;
		});
	const stale = consumeNotifications(1, {
		afterFence: async (row) => {
			expect(row.$id).toBe(staleId);
			reached();
			await hold;
		},
	});
	await hit;
	await expire(staleId);
	const reclaimed = await consumeNotifications(1);
	expect(reclaimed.delivered).toBe(1);
	const savedReadAt = new Date().toISOString();
	await db.updateRow({
		databaseId,
		tableId: "notifications_v1",
		rowId: staleId,
		data: { readAt: savedReadAt },
	});
	const expectedSavedReadAt = (
		await db.getRow({ databaseId, tableId: "notifications_v1", rowId: staleId })
	).readAt;
	resume();
	const old = await stale;
	expect(old.delivered).toBe(0);
	expect(old.failed).toBe(1);
	const final = await db.getRow({
		databaseId,
		tableId: "notification_outbox_v1",
		rowId: staleId,
	});
	expect(final.status).toBe("DELIVERED");
	expect(final.claim).toBeNull();
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notifications_v1",
				rowId: staleId,
			})
		).readAt,
	).toBe(expectedSavedReadAt);
	proof.oldAnchorLostToRealReclaim = {
		shortenedLeaseFixture: true,
		oldDelivered: 0,
		newDelivered: 1,
	};
	await writeFile(`${state}/durability-result.json`, JSON.stringify(proof));
});

// Discover actual built RPC IDs; no test endpoint or product bypass.
async function rpcURL(name: string) {
	const directory = fileURLToPath(
		new URL("../dist/server/assets/", import.meta.url),
	);
	for (const file of await readdir(directory)) {
		const source = await readFile(`${directory}/${file}`, "utf8");
		const start = source.indexOf(`var ${name} = createServerFn(`);
		const match =
			start < 0
				? null
				: source.slice(start).match(/createSsrRpc\("([a-f0-9]+)"/);
		if (match?.[1]) return `${origin}/_serverFn/${match[1]}`;
	}
	throw new Error(`Missing built RPC ${name}`);
}

test("accepted MESSAGE producer rolls back staging failure and delivers one private localized peer link", async ({
	page,
	context,
	request,
}) => {
	// Earlier logout intentionally revoked the original B fixture session.
	// Obtain a current session through the real application sign-in flow.
	await page.goto("/en/sign-in");
	await page.locator('input[name="email"]').fill(`${b.id}@example.test`);
	await page.locator('input[name="password"]').fill(b.password);
	await page
		.locator("form")
		.filter({ has: page.locator('input[name="email"]') })
		.getByRole("button", { name: "Sign in", exact: true })
		.click();
	await expect(page.getByTestId("identity")).toHaveText(b.id);
	const recipientSecret = (await context.cookies()).find(
		(cookie) => cookie.name === "nfe-session-dev",
	)?.value;
	if (!recipientSecret) throw new Error("Current recipient session missing");
	const recipientSessionSecret = decodeURIComponent(recipientSecret);
	secrets.push(recipientSecret, recipientSessionSecret);
	await writeFile(`${state}/runtime-secrets.json`, JSON.stringify(secrets));
	await chmod(`${state}/runtime-secrets.json`, 0o600);
	const sendUrl = await rpcURL("sendMessage");
	const content = "PRIVATE-MESSAGE-CONTENT-NEVER-IN-NOTIFICATION";
	const input = { toUserId: b.id, content, requestId: crypto.randomUUID() };
	const send = async () =>
		result<Reply<{ message: { id: string }; event: { eventId: string } }>>(
			await request.post(sendUrl, {
				headers: headers(a.secret),
				data: JSON.stringify(toJSON({ data: input })),
			}),
		);
	const before = await Promise.all(
		[
			"messages",
			"message_limits",
			"message_conversations",
			"notification_outbox_v1",
		].map(rows),
	);
	await control({ failStage: true });
	try {
		expect(await send()).toEqual({ ok: false, error: "unavailable" });
		const after = await Promise.all(
			[
				"messages",
				"message_limits",
				"message_conversations",
				"notification_outbox_v1",
			].map(rows),
		);
		expect(after.map((r) => r.rows)).toEqual(before.map((r) => r.rows));
	} finally {
		await control();
	}
	const replies = await Promise.all([send(), send()]);
	for (const reply of replies) expect(reply.ok).toBe(true);
	const sent = replies[0];
	if (!sent?.ok) throw new Error("MESSAGE send failed");
	const id = sent.value.message.id;
	for (const reply of replies)
		if (reply.ok) expect(reply.value.message.id).toBe(id);
	expect(
		(await rows("messages")).rows.filter((r) => r.$id === id),
	).toHaveLength(1);
	expect(
		(await rows("message_limits")).rows
			.filter((r) => r.senderId === a.id)
			.map((r) => r.count),
	).toEqual([1]);
	let events = (await rows("notification_outbox_v1")).rows.filter(
		(r) => r.type === "MESSAGE",
	);
	expect(events).toHaveLength(1);
	const event = events[0];
	if (!event) throw new Error("MESSAGE durable event missing");
	expect(event).toMatchObject({
		eventId: `message:${id}`,
		actorId: a.id,
		recipientId: b.id,
		targetId: a.id,
		entityId: id,
		status: "PENDING",
	});
	expect(JSON.stringify(event)).not.toContain(content);
	expect(
		(await rows("notifications_v1")).rows.filter((r) => r.type === "MESSAGE"),
	).toHaveLength(0);
	// Delivery starts only from durable provider state after the business RPC completed.
	await Promise.all([consumeNotifications(), consumeNotifications()]);
	const delivered = (await rows("notifications_v1")).rows.filter(
		(r) => r.type === "MESSAGE",
	);
	expect(delivered).toHaveLength(1);
	expect(delivered[0]?.$id).toBe(event.$id);
	for (const who of [null, a, admin]) {
		const sdk = new TablesDB(who ? base().setSession(who.secret) : base());
		await expect(
			sdk.getRow({ databaseId, tableId: "notifications_v1", rowId: event.$id }),
		).rejects.toBeDefined();
		expect(
			(
				await sdk.listRows({
					databaseId,
					tableId: "notifications_v1",
					queries: [Query.equal("type", "MESSAGE")],
				})
			).total,
		).toBe(0);
	}
	const listUrl = await rpcURL("getNotifications");
	const list = async (secret: string, viewerId = b.id) => {
		const url = new URL(listUrl);
		url.searchParams.set(
			"payload",
			JSON.stringify(toJSON({ data: { viewerId, cursor: null } })),
		);
		const response = await request.get(url.href, { headers: headers(secret) });
		expect(await response.text()).not.toContain(content);
		return result<Reply<NotificationPage>>(response);
	};
	expect(await list("")).toEqual({ ok: false, error: "unauthorized" });
	expect(await list(b.secret)).toEqual({ ok: false, error: "unauthorized" });
	for (const who of [a, admin])
		expect(await list(who.secret)).toEqual({ ok: false, error: "forbidden" });
	const found = await list(recipientSecret);
	if (!found.ok) throw new Error("Recipient list failed");
	expect(
		found.value.notifications.find((n) => n.id === event.$id)?.target,
	).toEqual({ id: a.id, available: true });
	await expect(
		new TablesDB(base().setSession(recipientSessionSecret)).getRow({
			databaseId,
			tableId: "notifications_v1",
			rowId: event.$id,
		}),
	).resolves.toMatchObject({ recipientId: b.id, type: "MESSAGE" });
	for (const locale of ["fr", "en"] as const) {
		await page.goto(`/${locale}/notifications`);
		const messageItem = page.locator(
			'[data-testid="notification-item"][data-type="MESSAGE"]',
		);
		await expect(messageItem).toHaveCount(1);
		await expect(messageItem).toContainText(
			locale === "fr"
				? "Public notifications-a vous a envoyé un message"
				: "Public notifications-a sent you a message",
		);
		await expect(messageItem.getByRole("link")).toHaveAttribute(
			"href",
			`/${locale}/messages/${a.id}`,
		);
		await expect(messageItem).not.toContainText(content);
	}
	await page
		.locator('[data-testid="notification-item"][data-type="MESSAGE"]')
		.getByRole("link")
		.click();
	await expect(page.locator(`[data-message-id="${id}"]`)).toContainText(
		content,
	);
	const markUrl = await rpcURL("setNotificationsRead");
	const read = async () =>
		result<Reply<unknown>>(
			await request.post(markUrl, {
				headers: headers(recipientSecret),
				data: JSON.stringify(
					toJSON({ data: { viewerId: b.id, mode: "one", id: event.$id } }),
				),
			}),
		);
	expect(await read()).toMatchObject({ ok: true });
	const receipt = await db.getRow({
		databaseId,
		tableId: "notifications_v1",
		rowId: event.$id,
	});
	expect(receipt.readAt).not.toBeNull();
	expect((await send()).ok).toBe(true);
	await consumeNotifications();
	events = (await rows("notification_outbox_v1")).rows.filter(
		(r) => r.type === "MESSAGE",
	);
	expect(events).toHaveLength(1);
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "notifications_v1",
				rowId: event.$id,
			})
		).readAt,
	).toBe(receipt.readAt);
	// A readable notification cannot manufacture a link to another sender's message.
	await db.updateRow({
		databaseId,
		tableId: "notifications_v1",
		rowId: event.$id,
		data: { targetId: admin.id },
	});
	const mismatch = await list(recipientSecret);
	if (!mismatch.ok) throw new Error("Recipient mismatch list failed");
	expect(
		mismatch.value.notifications.find((n) => n.id === event.$id)?.target
			.available,
	).toBe(false);
	await db.updateRow({
		databaseId,
		tableId: "notifications_v1",
		rowId: event.$id,
		data: { targetId: a.id },
	});
	await db.deleteRow({ databaseId, tableId: "messages", rowId: id });
	const deleted = await list(recipientSecret);
	if (!deleted.ok) throw new Error("Recipient deleted list failed");
	expect(
		deleted.value.notifications.find((n) => n.id === event.$id)?.target
			.available,
	).toBe(false);
	await writeFile(
		`${state}/message-result.json`,
		JSON.stringify({
			atomicRollback: true,
			concurrentDedupe: true,
			stableEventId: true,
			recipientOnlySDKRPC: true,
			readerLocales: ["fr", "en"],
			peerLink: true,
			replayPreservesReadAt: true,
			mismatchedAndDeletedMessageUnavailable: true,
		}),
	);
});

test("legacy unknown target, FR/EN distinct timezone hydration, delayed SPA A-B-A and hidden/deleted fallback", async ({
	page,
	context,
	request,
}) => {
	const legacy = legacyNotification({
		id: "legacy-follow-no-target",
		userId: b.id,
		type: "FOLLOW",
		createdAt: new Date().toISOString(),
	});
	await notificationTransaction(db, (tx) =>
		stageLegacyNotification(tx, legacy),
	);
	await consumeNotifications();
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => {
		if (m.type() === "error" && /hydration|did not match/i.test(m.text()))
			errors.push(m.text());
	});
	async function login(who: typeof a, locale = "en") {
		await page.locator('input[name="email"]').fill(`${who.id}@example.test`);
		await page.locator('input[name="password"]').fill(who.password);
		await page
			.locator("form")
			.filter({ has: page.locator('input[name="email"]') })
			.getByRole("button", {
				name: locale === "fr" ? "Connexion" : "Sign in",
				exact: true,
			})
			.click();
		await expect(page.getByTestId("identity")).toHaveText(who.id);
		const cookie = (await context.cookies()).find(
			(x) => x.name === "nfe-session-dev",
		);
		if (cookie) secrets.push(cookie.value, decodeURIComponent(cookie.value));
		await writeFile(`${state}/runtime-secrets.json`, JSON.stringify(secrets));
		await chmod(`${state}/runtime-secrets.json`, 0o600);
	}
	await page.goto("/en/sign-in");
	await login(b);
	await page.locator('a[href="/en/notifications"]').click();
	const historical = page
		.getByTestId("notification-item")
		.filter({ hasText: "Someone started following you" });
	await expect(historical).toContainText("Target unavailable");
	await expect(historical.locator("a")).toHaveCount(0);
	for (const locale of ["fr", "en"] as const) {
		const html = await request.get(`${origin}/${locale}/notifications`, {
			headers: {
				Cookie: (await context.cookies())
					.filter((x) => x.name === "nfe-session-dev")
					.map((x) => `${x.name}=${x.value}`)
					.join("; "),
			},
		});
		const expected = formatNotificationDate(locale, legacy.occurredAt);
		expect(await html.text()).toContain(expected);
		await page.goto(`/${locale}/notifications`);
		await expect(
			page
				.getByTestId("notification-item")
				.filter({
					hasText:
						locale === "fr"
							? "Quelqu’un vous suit"
							: "Someone started following you",
				})
				.locator("time"),
		).toHaveText(expected);
	}
	await page.locator('a[href="/en/private"]').click();
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await login(a);
	await page.locator('a[href="/en/notifications"]').click();
	type RouterWindow = {
		__TSR_ROUTER__: { options: { context: { queryClient: QueryClient } } };
	};
	const original = await page.evaluateHandle(() => {
		const c = (window as unknown as RouterWindow).__TSR_ROUTER__.options.context
			.queryClient;
		return c
			.getQueryCache()
			.find({ queryKey: ["notifications", "notifications-a"] });
	});
	await control({ recipient: a.id });
	await page.evaluate(() => {
		const c = (window as unknown as RouterWindow).__TSR_ROUTER__.options.context
			.queryClient;
		void c.invalidateQueries({
			queryKey: ["notifications", "notifications-a"],
		});
	});
	await expect
		.poll(async () => {
			const controlUrl = process.env.NFE_NOTIFICATION_PROXY_CONTROL,
				controlToken = process.env.NFE_NOTIFICATION_PROXY_TOKEN;
			if (!controlUrl || !controlToken) throw new Error("Proxy not configured");
			const r = await fetch(controlUrl, {
				headers: { "x-proof-token": controlToken },
			});
			return ((await r.json()) as { hit: boolean }).hit;
		})
		.toBe(true);
	try {
		await page.locator('a[href="/en/private"]').click();
		await page.getByRole("button", { name: "Sign out", exact: true }).click();
		await login(b);
		await page.locator('a[href="/en/notifications"]').click();
		await expect(
			page.getByTestId("notification-item").filter({
				hasText: "Public notifications-admin started following you",
			}),
		).toHaveCount(0);
		await page.locator('a[href="/en/private"]').click();
		await page.getByRole("button", { name: "Sign out", exact: true }).click();
		await login(a);
		await page.locator('a[href="/en/notifications"]').click();
		expect(
			await page.evaluate((old) => {
				const c = (window as unknown as RouterWindow).__TSR_ROUTER__.options
					.context.queryClient;
				return (
					c
						.getQueryCache()
						.find({ queryKey: ["notifications", "notifications-a"] }) !== old
				);
			}, original),
		).toBe(true);
	} finally {
		await control();
	}
	await expect(
		page
			.getByTestId("notification-item")
			.filter({ hasText: "Public notifications-admin started following you" }),
	).toHaveCount(3);
	// Now hide/delete actor A and delete a target; no privileged fallback may recover names/content.
	await db.updateRow({
		databaseId,
		tableId: "profiles",
		rowId: a.id,
		data: { isOnboarded: false },
		permissions: [],
	});
	await page.locator('a[href="/en/private"]').click();
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await login(b);
	const capture = page.waitForRequest(
		(r) =>
			r.url().includes("/_serverFn/") &&
			r.method() === "GET" &&
			decodeURIComponent(r.url()).includes("cursor"),
	);
	await page.locator('a[href="/en/notifications"]').click();
	const listUrl = (await capture).url();
	async function all() {
		const secret = (await context.cookies()).find(
			(x) => x.name === "nfe-session-dev",
		)?.value;
		if (!secret) throw new Error("Session missing");
		const found: NotificationPage["notifications"] = [];
		let cursor: string | null = null;
		do {
			const url = new URL(listUrl);
			url.searchParams.set(
				"payload",
				JSON.stringify(toJSON({ data: { viewerId: b.id, cursor } })),
			);
			const r = await result<Reply<NotificationPage>>(
				await request.get(url.href, { headers: headers(secret) }),
			);
			if (!r.ok) throw new Error("List denied");
			found.push(...r.value.notifications);
			cursor = r.value.nextCursor;
		} while (cursor);
		return found;
	}
	let items = await all();
	expect(
		items.filter((n) => n.metadata.entityId.startsWith("imported-edge-"))
			.length,
	).toBe(25);
	expect(
		items
			.filter((n) => n.metadata.entityId.startsWith("imported-edge-"))
			.every((n) => n.actor.name === null && n.actor.id === null),
	).toBe(true);
	await db.deleteRow({ databaseId, tableId: "profiles", rowId: a.id });
	await db.deleteRow({ databaseId, tableId: "posts", rowId: "social-public" });
	items = await all();
	expect(
		items.filter((n) => n.target.id === "social-public").length,
	).toBeGreaterThanOrEqual(2);
	expect(
		items
			.filter((n) => n.target.id === "social-public")
			.every((n) => !n.target.available),
	).toBe(true);
	expect(
		items.find((n) => n.metadata.entityId === "legacy-follow-no-target")
			?.target,
	).toEqual({ id: null, available: false });
	expect(items.every((n) => n.actor.name !== "Public notifications-a")).toBe(
		true,
	);
	expect(errors).toEqual([]);
});
