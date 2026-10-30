import { readFile } from "node:fs/promises";
import { type APIResponse, expect, test } from "@playwright/test";
import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";
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
		await call(commentUrl, { ...createData, content: "x".repeat(5001) }),
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
	await guest.close();
	// Real same-tab signout/login invokes cancellation and clearing, then B sees only B's list.
	await page.goto("/en/private");
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(page).toHaveURL(/\/en\/sign-in/);
	await page.getByLabel("Email address").fill(`${b.id}@example.test`);
	await page.getByLabel("Password", { exact: true }).fill(b.password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByTestId("identity")).toHaveText(b.id);
	await page.goto("/en/profile/favorites");
	await expect(page.getByText("No visible favorites.")).toBeVisible();
	await page.goto(`/en/post/${id}`);
	await expect(
		panel.getByRole("button", { name: "Save", exact: true }),
	).toBeVisible();
	expect(errors).toEqual([]);
});
