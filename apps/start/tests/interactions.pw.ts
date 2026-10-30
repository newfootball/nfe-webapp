import { readFile } from "node:fs/promises";
import { type APIResponse, expect, test } from "@playwright/test";
import {
	Client,
	Permission,
	Query,
	Role,
	TablesDB,
	Users,
} from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/interactions-local";
import type {
	FavoritePage,
	InteractionChange,
} from "../src/lib/interactions-contract";

const databaseId = "interactions-proof";
if (process.env.START_APPWRITE_DATABASE !== databaseId)
	throw new Error("Isolated interactions proof database required");
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; password: string; secret: string }[];
};
function actor(i: number) {
	const a = fixture.actors[i];
	if (!a) throw new Error("Missing fixture");
	return a;
}
const a = actor(0),
	b = actor(1),
	admin = actor(2),
	origin = "http://127.0.0.1:3571",
	id = "social-public";
const base = () => new Client().setEndpoint(endpoint).setProject(c.project);
const db = new TablesDB(base().setKey(c.proofKey));
const secrets = [
	c.proofKey,
	c.writerKey,
	c.sessionKey,
	c.readerKey,
	...fixture.actors.flatMap((a) => [a.password, a.secret]),
	"CONFIDENTIAL-INTERACTIONS-PROFILE",
];
const headers = (secret = a.secret, extra: Record<string, string> = {}) => ({
	"x-tsr-serverfn": "true",
	"content-type": "application/json",
	Accept: "application/json",
	Origin: origin,
	"sec-fetch-site": "same-origin",
	Cookie: secret ? `nfe-session-dev=${secret}` : "",
	...extra,
});
const body = (data: unknown) => JSON.stringify(toJSON({ data }));
async function result<T>(r: APIResponse): Promise<T> {
	expect(r.status()).toBe(200);
	expect(r.headers()["cache-control"]).toBe("private, no-store");
	const raw = await r.text();
	for (const secret of secrets) expect(raw.includes(secret)).toBe(false);
	const e = fromCrossJSON(JSON.parse(raw), {}) as {
		result: T;
		error?: unknown;
	};
	expect(e.error).toBeUndefined();
	return e.result;
}
type ChangeResult =
	| { ok: true; value: InteractionChange }
	| { ok: false; error: string };
async function rows(tableId: string, postId = id, userId?: string) {
	return db.listRows({
		databaseId,
		tableId,
		queries: [
			Query.equal("postId", postId),
			...(userId ? [Query.equal("userId", userId)] : []),
			Query.limit(100),
		],
	});
}
test.beforeEach(async () => {
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "social-orphan",
		data: {},
		permissions: [Permission.read(Role.any())],
	});
	for (const tableId of ["likes", "comments", "favorites"]) {
		const r = await db.listRows({
			databaseId,
			tableId,
			queries: [Query.limit(100)],
		});
		if (r.total > 100) throw new Error("Unexpected synthetic proof capacity");
		for (const row of r.rows)
			await db.deleteRow({ databaseId, tableId, rowId: row.$id });
	}
});
test("real interactions: A B admin anonymous, concurrent pairs, ownership, privacy, rollback, reload, FR EN and account switch", async ({
	page,
	context,
	request,
	browser,
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
	await page.goto(`/en/post/${id}`);
	const panel = page.getByTestId("social-interactions");
	await expect(panel.getByTestId("interaction-counts")).toHaveText(
		"Like: 0 · Comments: 0",
	);
	const capture = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await panel.getByRole("button", { name: "Like", exact: true }).click();
	const pairUrl = (await capture).url();
	await expect(
		panel.getByRole("button", { name: "Unlike", exact: true }),
	).toBeEnabled();
	const call = async (
		url: string,
		data: unknown,
		secret = a.secret,
		extra: Record<string, string> = {},
	) =>
		result<ChangeResult>(
			await request.post(url, {
				headers: headers(secret, extra),
				data: body(data),
			}),
		);
	const pair = async (
		active: boolean,
		kind = "like",
		secret = a.secret,
		postId = id,
	) => call(pairUrl, { id: postId, kind, active }, secret);
	await page.reload();
	await expect(panel.getByTestId("interaction-counts")).toHaveText(
		"Like: 1 · Comments: 0",
	);
	const before = await db.getRow({ databaseId, tableId: "posts", rowId: id });
	for (const [data, secret, extra, error] of [
		[{ id, kind: "like", active: true }, "", {}, "unauthorized"],
		[{ id, kind: "like", active: true, userId: b.id }, a.secret, {}, "invalid"],
		[
			{ id, kind: "favorite", active: true, role: "admin" },
			a.secret,
			{},
			"invalid",
		],
		[{ id, kind: "like", active: "false" }, a.secret, {}, "invalid"],
		[
			{ id, kind: "like", active: true },
			a.secret,
			{ Origin: "https://evil.test" },
			"origin",
		],
		[{ id, kind: "like", active: true }, a.secret, { Origin: "" }, "origin"],
	] as const)
		expect(await call(pairUrl, data, secret, extra)).toEqual({
			ok: false,
			error,
		});
	for (const secret of [a.secret, b.secret, admin.secret])
		for (const hidden of [
			"social-draft",
			"social-archived",
			"social-private",
			"social-orphan",
			"missing-post",
		])
			for (const kind of ["like", "favorite"])
				expect(await pair(true, kind, secret, hidden)).toEqual({
					ok: false,
					error: "forbidden",
				});
	expect(await pair(true)).toMatchObject({ ok: true, value: { event: null } });
	await pair(false);
	const creates = await Promise.all(
		Array.from({ length: 12 }, () => pair(true)),
	);
	expect(creates.every((r) => r.ok)).toBe(true);
	expect((await rows("likes", id, a.id)).total).toBe(1);
	const events = creates.flatMap((r) =>
		r.ok && r.value.event ? [r.value.event] : [],
	);
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({
		version: 1,
		type: "LIKE_CREATED",
		actorId: a.id,
		recipientId: b.id,
		postId: id,
	});
	expect(Object.keys(events[0] ?? {}).sort()).toEqual([
		"actorId",
		"entityId",
		"eventId",
		"occurredAt",
		"postId",
		"recipientId",
		"type",
		"version",
	]);
	const removes = await Promise.all(
		Array.from({ length: 12 }, () => pair(false)),
	);
	expect(removes.every((r) => r.ok)).toBe(true);
	expect((await rows("likes", id, a.id)).total).toBe(0);
	await Promise.all(Array.from({ length: 8 }, (_, i) => pair(i % 2 === 0)));
	const persisted = (await rows("likes", id, a.id)).total;
	expect(persisted).toBeLessThanOrEqual(1);
	await page.reload();
	await expect(panel.getByTestId("interaction-counts")).toHaveText(
		`Like: ${persisted} · Comments: 0`,
	);
	await pair(false);
	await page.reload();
	await expect(
		panel.getByRole("button", { name: "Like", exact: true }),
	).toBeEnabled();
	await page.route(pairUrl, (r) => r.abort());
	await panel.getByRole("button", { name: "Like", exact: true }).click();
	await expect(panel.getByRole("alert")).toContainText(
		"Interactions are unavailable",
	);
	await expect(panel.getByTestId("interaction-counts")).toHaveText(
		"Like: 0 · Comments: 0",
	);
	expect((await rows("likes", id, a.id)).total).toBe(0);
	await page.unroute(pairUrl);
	const favorite = await Promise.all(
		Array.from({ length: 12 }, () => pair(true, "favorite")),
	);
	expect(favorite.every((r) => r.ok)).toBe(true);
	expect((await rows("favorites", id, a.id)).total).toBe(1);
	await page.reload();
	await panel.getByRole("link", { name: "My favorites", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "My favorites" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Public social-public" }),
	).toBeVisible();
	const favRequest = page.waitForRequest(
		(r) =>
			r.url().includes("/_serverFn/") &&
			decodeURIComponent(r.url()).includes('"cursor"'),
	);
	await page.reload();
	const listUrl = (await favRequest).url();
	expect(
		await result(await request.get(listUrl, { headers: headers("") })),
	).toEqual({ ok: false, error: "unauthorized" });
	const other = await result<{ ok: true; value: FavoritePage }>(
		await request.get(listUrl, { headers: headers(b.secret) }),
	);
	expect(other.value.posts).toEqual([]);
	expect(other.value.viewerId).toBe(b.id);
	const forged = new URL(listUrl);
	forged.searchParams.set(
		"payload",
		JSON.stringify(toJSON({ data: { cursor: null, userId: a.id } })),
	);
	expect(
		await result(
			await request.get(forged.href, { headers: headers(b.secret) }),
		),
	).toEqual({ ok: false, error: "invalid" });
	// Favorites are private even to an admin and through direct Appwrite clients.
	const favoriteId = (await rows("favorites", id, a.id)).rows[0]?.$id;
	if (!favoriteId) throw new Error("Missing favorite");
	for (const client of [
		base(),
		base().setSession(b.secret),
		base().setSession(admin.secret),
	]) {
		let code = 0;
		try {
			await new TablesDB(client).getRow({
				databaseId,
				tableId: "favorites",
				rowId: favoriteId,
			});
		} catch (e) {
			code = (e as { code: number }).code;
		}
		expect([401, 403, 404]).toContain(code);
	}
	await page.goto(`/en/post/${id}`);
	await panel.getByRole("button", { name: "Comments", exact: true }).click();
	await expect(panel.getByLabel("Your comment")).toBeVisible();
	const commentCapture = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await panel.getByLabel("Your comment").fill("A comment <script> literal");
	await panel.getByRole("button", { name: "Comment", exact: true }).click();
	const commentUrl = (await commentCapture).url();
	await expect(
		panel.getByText("A comment <script> literal", { exact: true }),
	).toBeVisible();
	const token = crypto.randomUUID();
	const createData = { id, requestId: token, content: "Concurrent comment" };
	const comments = await Promise.all(
		Array.from({ length: 12 }, () => call(commentUrl, createData)),
	);
	expect(comments.every((r) => r.ok)).toBe(true);
	expect((await rows("comments")).total).toBe(2);
	expect(
		comments.flatMap((r) => (r.ok && r.value.event ? [r.value.event] : [])),
	).toHaveLength(1);
	for (const secret of [a.secret, b.secret, admin.secret])
		for (const hidden of [
			"social-draft",
			"social-archived",
			"social-private",
			"social-orphan",
			"missing-post",
		])
			expect(
				await call(
					commentUrl,
					{ ...createData, id: hidden, requestId: crypto.randomUUID() },
					secret,
				),
			).toEqual({ ok: false, error: "forbidden" });
	expect(await call(commentUrl, { ...createData, userId: b.id })).toEqual({
		ok: false,
		error: "invalid",
	});
	expect(await call(commentUrl, { ...createData, content: " " })).toEqual({
		ok: false,
		error: "invalid",
	});
	expect(
		await call(commentUrl, { ...createData, content: "x".repeat(1001) }),
	).toEqual({ ok: false, error: "invalid" });
	expect(await call(commentUrl, createData, "")).toEqual({
		ok: false,
		error: "unauthorized",
	});
	const bComment = await call(
		commentUrl,
		{ id, requestId: crypto.randomUUID(), content: "B comment" },
		b.secret,
	);
	expect(bComment).toMatchObject({
		ok: true,
		value: { event: { actorId: b.id } },
	});
	await page.reload();
	await panel.getByRole("button", { name: "Comments", exact: true }).click();
	await expect(panel.getByText("B comment", { exact: true })).toBeVisible();
	await expect(
		panel
			.locator("article")
			.filter({ hasText: "B comment" })
			.getByRole("button", { name: "Delete" }),
	).toHaveCount(0);
	const own = panel
		.locator("article")
		.filter({ hasText: "A comment <script> literal" });
	const deleteCapture = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await own.getByRole("button", { name: "Delete", exact: true }).click();
	const deleteUrl = (await deleteCapture).url();
	await expect(own).toHaveCount(0);
	const ownId = (await rows("comments")).rows.find(
			(r) => r.userId === a.id,
		)?.$id,
		bId = (await rows("comments")).rows.find((r) => r.userId === b.id)?.$id;
	if (!ownId || !bId) throw new Error("Comment fixtures absent");
	expect(await call(deleteUrl, { id, commentId: ownId }, b.secret)).toEqual({
		ok: false,
		error: "forbidden",
	});
	expect(await call(deleteUrl, { id, commentId: bId }, a.secret)).toEqual({
		ok: false,
		error: "forbidden",
	});
	expect(
		await call(deleteUrl, { id: "social-second", commentId: ownId }),
	).toEqual({ ok: false, error: "forbidden" });
	expect(await call(deleteUrl, { id, commentId: ownId }, "")).toEqual({
		ok: false,
		error: "unauthorized",
	});
	expect(
		await call(deleteUrl, { id, commentId: ownId }, admin.secret),
	).toMatchObject({
		ok: true,
		value: { event: { type: "COMMENT_REMOVED", actorId: admin.id } },
	});
	expect(await call(deleteUrl, { id, commentId: bId }, b.secret)).toMatchObject(
		{ ok: true },
	);
	expect((await rows("comments")).total).toBe(0);
	// Direct Appwrite writes to interactions are never authorized by row ACLs.
	for (const client of [base(), base().setSession(a.secret)])
		for (const tableId of ["likes", "comments", "favorites"]) {
			let code = 0;
			try {
				await new TablesDB(client).createRow({
					databaseId,
					tableId,
					rowId: "forged-row",
					data: {
						postId: id,
						userId: b.id,
						createdAt: before.createdAt,
						updatedAt: before.updatedAt,
						...(tableId === "comments" ? { content: "forged" } : {}),
					},
					permissions: [Permission.read(Role.any())],
				});
			} catch (e) {
				code = (e as { code: number }).code;
			}
			expect([401, 403]).toContain(code);
		}
	const after = await db.getRow({ databaseId, tableId: "posts", rowId: id });
	for (const field of [
		"slug",
		"createdAt",
		"updatedAt",
		"publishedAt",
		"expiresAt",
		"validatedAt",
		"userId",
		"title",
		"description",
	])
		expect(after[field]).toEqual(before[field]);
	await page.goto(`/fr/user/${b.id}`);
	await expect(
		page
			.getByTestId("social-interactions")
			.first()
			.getByRole("button", { name: "J’aime", exact: true }),
	).toBeVisible();
	const guest = await browser.newContext(),
		guestPage = await guest.newPage();
	await guestPage.goto(`${origin}/en/post/${id}`);
	await expect(
		guestPage.getByRole("link", { name: "Sign in to interact" }),
	).toBeVisible();
	await guestPage.goto(`${origin}/en/profile/favorites`);
	await expect(guestPage).toHaveURL(/\/en\/sign-in/);

	await guestPage.getByLabel("Email address").fill(`${b.id}@example.test`);
	await guestPage.getByLabel("Password", { exact: true }).fill(b.password);
	await guestPage.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(guestPage).toHaveURL(/\/en\/profile\/favorites$/);
	await expect(guestPage.getByText("No visible favorites.")).toBeVisible();
	await guest.close();
	// The orphan denial fixture is intentionally malformed; accepted feed fails
	// closed on that row. Withdraw it only after all orphan mutation denials above.
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "social-orphan",
		data: {},
		permissions: [],
	});
	// Controlled Appwrite interleavings: the proxy holds real upstream traffic,
	// without any production header or business-code hook.
	const control = process.env.NFE_INTERACTION_PROXY_CONTROL,
		proxyToken = process.env.NFE_INTERACTION_PROXY_TOKEN;
	if (!control || !proxyToken) throw new Error("Proof proxy required");
	const proxy = async (method: string, data?: unknown) =>
		request.fetch(control, {
			method,
			headers: { "x-proof-token": proxyToken },
			data,
		});
	const arm = async (postId: string, phase = "anchor", when = "after") => {
		await proxy("POST", { postId, phase, when });
	};
	const hit = async () => {
		await expect
			.poll(
				async () =>
					((await (await proxy("GET")).json()) as { hit: boolean }).hit,
			)
			.toBe(true);
	};
	const release = async () => {
		await proxy("DELETE");
	};
	await pair(false, "like", a.secret);
	await pair(false, "like", b.secret);
	await arm(id);
	const slowLike = pair(true, "like", a.secret);
	await hit();
	expect(await pair(true, "like", b.secret)).toMatchObject({ ok: true });
	await release();
	expect(await slowLike).toMatchObject({ ok: true });
	expect((await rows("likes")).total).toBe(2);
	await arm(id);
	const slowComment = call(commentUrl, {
		id,
		requestId: crypto.randomUUID(),
		content: "Controlled A",
	});
	await hit();
	expect(
		await call(
			commentUrl,
			{ id, requestId: crypto.randomUUID(), content: "Controlled B" },
			b.secret,
		),
	).toMatchObject({ ok: true });
	await release();
	expect(await slowComment).toMatchObject({ ok: true });
	// Archive, ACL withdrawal and deletion at different transaction boundaries.
	const parentId = "social-second",
		parent = await db.getRow({ databaseId, tableId: "posts", rowId: parentId });
	const parentData = Object.fromEntries(
		Object.entries(parent).filter(([key]) => !key.startsWith("$")),
	);
	for (const mode of ["archive", "acl", "delete"] as const) {
		await arm(
			parentId,
			mode === "archive" ? "commit" : "anchor",
			mode === "archive" ? "before" : "after",
		);
		const pending = pair(true, "like", a.secret, parentId);
		await hit();
		if (mode === "delete")
			await db.deleteRow({ databaseId, tableId: "posts", rowId: parentId });
		else
			await db.updateRow({
				databaseId,
				tableId: "posts",
				rowId: parentId,
				data: mode === "archive" ? { status: "ARCHIVED" } : {},
				permissions: [Permission.read(Role.user(a.id))],
			});
		await release();
		const denied = await pending;
		expect(denied.ok).toBe(false);
		expect((await rows("likes", parentId)).total).toBe(0);
		if (mode === "delete")
			await db.createRow({
				databaseId,
				tableId: "posts",
				rowId: parentId,
				data: parentData,
				permissions: [Permission.read(Role.any())],
			});
		else
			await db.updateRow({
				databaseId,
				tableId: "posts",
				rowId: parentId,
				data: { status: "PUBLISHED" },
				permissions: [Permission.read(Role.any())],
			});
	}
	// More than one page, arbitrary imported IDs and tied business timestamps.
	for (const row of (await rows("comments")).rows)
		await db.deleteRow({ databaseId, tableId: "comments", rowId: row.$id });
	const expectedComments = [] as { id: string; createdAt: string }[];
	for (let i = 0; i < 25; i++) {
		const rowId = `legacy-comment-${String(24 - i).padStart(2, "0")}`,
			createdAt = `2026-10-${String(25 + (i % 3)).padStart(2, "0")}T10:00:00.000Z`;
		await db.createRow({
			databaseId,
			tableId: "comments",
			rowId,
			data: {
				postId: id,
				userId: a.id,
				content: `Imported comment ${i}`,
				createdAt,
				updatedAt: createdAt,
			},
			permissions: [],
		});
		expectedComments.push({ id: rowId, createdAt });
	}
	expectedComments.sort(
		(a, b) =>
			b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
	);
	await page.goto(`/en/post/${id}`);
	const commentsRead = page.waitForRequest(
		(r) =>
			r.method() === "GET" &&
			r.url().includes("/_serverFn/") &&
			decodeURIComponent(r.url()).includes('"cursor"'),
	);
	await panel.getByRole("button", { name: "Comments", exact: true }).click();
	const commentListUrl = (await commentsRead).url();
	type CommentsResult = {
		ok: true;
		value: {
			comments: { id: string; content: string }[];
			nextCursor: string | null;
		};
	};
	const first = await result<CommentsResult>(
		await request.get(commentListUrl, { headers: headers() }),
	);
	expect(first.value.comments.map((c) => c.id)).toEqual(
		expectedComments.slice(0, 20).map((c) => c.id),
	);
	expect(first.value.nextCursor).not.toBeNull();
	const next = new URL(commentListUrl);
	next.searchParams.set(
		"payload",
		JSON.stringify(toJSON({ data: { id, cursor: first.value.nextCursor } })),
	);
	const last = await result<CommentsResult>(
		await request.get(next.href, { headers: headers() }),
	);
	expect(last.value.comments.map((c) => c.id)).toEqual(
		expectedComments.slice(20).map((c) => c.id),
	);
	expect(last.value.nextCursor).toBeNull();
	await panel.getByRole("button", { name: "Show more", exact: true }).click();
	await expect(panel.locator("article")).toHaveCount(25);
	let releaseDraft!: () => void, hitDraft!: () => void;
	const heldDraft = new Promise<void>((resolve) => {
			releaseDraft = resolve;
		}),
		draftReached = new Promise<void>((resolve) => {
			hitDraft = resolve;
		});
	await page.route(commentUrl, async (route) => {
		const response = await route.fetch();
		hitDraft();
		await heldDraft;
		await route.fulfill({ response });
	});
	const acceptedContent = "x".repeat(1000);
	await panel.getByLabel("Your comment").fill(acceptedContent);
	await panel.getByRole("button", { name: "Comment", exact: true }).click();
	await draftReached;
	await panel.getByLabel("Your comment").fill("New unsent draft");
	releaseDraft();
	await expect(panel.getByLabel("Your comment")).toHaveValue(
		"New unsent draft",
	);
	await expect(panel.getByText(acceptedContent, { exact: true })).toBeVisible();
	await page.unroute(commentUrl);
	const reconciled = await result<CommentsResult>(
		await request.get(commentListUrl, { headers: headers() }),
	);
	expect(reconciled.value.comments[0]?.content).toBe(acceptedContent);
	// Favorites also retain business ordering and page through an imported set.
	for (let i = 0; i < 22; i++) {
		const postId = `social-fav-${String(i).padStart(2, "0")}`,
			createdAt = "2026-10-24T10:00:00.000Z";
		try {
			await db.getRow({ databaseId, tableId: "posts", rowId: postId });
		} catch (e) {
			if ((e as { code: number }).code !== 404) throw e;
			await db.createRow({
				databaseId,
				tableId: "posts",
				rowId: postId,
				data: {
					...parentData,
					slug: postId,
					createdAt,
					updatedAt: createdAt,
					title: postId,
					titleFolded: postId,
				},
				permissions: [Permission.read(Role.any())],
			});
		}
		await db.createRow({
			databaseId,
			tableId: "favorites",
			rowId: `legacy-favorite-${String(i).padStart(2, "0")}`,
			data: { userId: a.id, postId, createdAt, updatedAt: createdAt },
			permissions: [Permission.read(Role.user(a.id))],
		});
	}
	await panel.getByRole("link", { name: "My favorites", exact: true }).click();
	await expect(page.locator("[data-post-id]")).toHaveCount(20);
	await page.getByRole("button", { name: "Show more", exact: true }).click();
	await expect(page.locator("[data-post-id]")).toHaveCount(23);
	// This entire section must keep one browser document and one router QueryClient.
	await page.goto(`/en/post/${id}`);
	const documentToken = await page.evaluate(() => {
		const w = window as Window & { nfeInteractionDocument?: string };
		w.nfeInteractionDocument = crypto.randomUUID();
		return w.nfeInteractionDocument;
	});
	const sameDocument = async () =>
		expect(
			await page.evaluate(
				() =>
					(window as Window & { nfeInteractionDocument?: string })
						.nfeInteractionDocument,
			),
		).toBe(documentToken);
	const switchTo = async (actor: { id: string; password: string }) => {
		await page.getByRole("link", { name: "My space", exact: true }).click();
		await page.getByRole("button", { name: "Sign out", exact: true }).click();
		await expect(page).toHaveURL(/\/en\/sign-in/);
		await page.getByLabel("Email address").fill(`${actor.id}@example.test`);
		await page.getByLabel("Password", { exact: true }).fill(actor.password);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await expect(page.getByTestId("identity")).toHaveText(actor.id);
		await sameDocument();
	};
	const openPost = async () => {
		await page.getByRole("link", { name: "Home", exact: true }).click();
		await page
			.locator(`[data-post-id="${id}"]`)
			.getByRole("link", { name: "Public social-public", exact: true })
			.click();
		await expect(panel.getByTestId("interaction-counts")).toBeVisible();
		await sameDocument();
	};
	let releaseMutation!: () => void, hitMutation!: () => void;
	const heldMutation = new Promise<void>((resolve) => {
			releaseMutation = resolve;
		}),
		mutationReached = new Promise<void>((resolve) => {
			hitMutation = resolve;
		});
	await page.route(pairUrl, async (route) => {
		const response = await route.fetch();
		hitMutation();
		await heldMutation;
		await route.fulfill({ response });
	});
	await panel
		.getByRole("button", { name: "Remove favorite", exact: true })
		.click();
	await mutationReached;
	await switchTo(b);
	await openPost();
	await expect(
		panel.getByRole("button", { name: "Save", exact: true }),
	).toBeVisible();
	await switchTo(a);
	// Intervening A state differs from the delayed old A result; late callbacks must
	// not restore the old Query object even when viewerId is A again.
	const replacement = await new Users(base().setKey(c.proofKey)).createSession({
		userId: a.id,
	});
	secrets.push(replacement.secret);
	expect(await pair(true, "favorite", replacement.secret)).toMatchObject({
		ok: true,
	});
	await openPost();
	await expect(
		panel.getByRole("button", { name: "Remove favorite", exact: true }),
	).toBeVisible();
	releaseMutation();
	await page.unroute(pairUrl);
	await expect(
		panel.getByRole("button", { name: "Remove favorite", exact: true }),
	).toBeVisible();
	await sameDocument();
	await switchTo(b);
	await openPost();
	await panel.getByRole("link", { name: "My favorites", exact: true }).click();
	await expect(page.getByText("No visible favorites.")).toBeVisible();
	await sameDocument();
	expect(errors).toEqual([]);
});
