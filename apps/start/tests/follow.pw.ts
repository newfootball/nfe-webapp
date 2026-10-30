import { readFile } from "node:fs/promises";
import { type APIResponse, expect, type Page, test } from "@playwright/test";
import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/follow-local";
import type { FollowChange, FollowPage } from "../src/lib/follow-contract";

const databaseId = "follow-proof";
if (process.env.START_APPWRITE_DATABASE !== databaseId)
	throw new Error("Synthetic isolated follow database required");
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; secret: string; password: string }[];
};
function actor(index: number) {
	const value = fixture.actors[index];
	if (!value) throw new Error("Missing follow fixture actor");
	return value;
}
const a = actor(0),
	b = actor(1),
	admin = actor(2);
const origin = "http://127.0.0.1:3570";
const base = () => new Client().setEndpoint(endpoint).setProject(c.project);
const db = new TablesDB(base().setKey(c.proofKey));
const secrets = [
	c.proofKey,
	c.sessionKey,
	c.writerKey,
	c.readerKey,
	...fixture.actors.flatMap((a) => [a.secret, a.password]),
	"CONFIDENTIAL-FOLLOW-PROFILE",
];
const headers = (secret: string, extra: Record<string, string> = {}) => ({
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
	const text = await r.text();
	for (const secret of secrets) expect(text.includes(secret)).toBe(false);
	const envelope = fromCrossJSON(JSON.parse(text), {}) as {
		result: T;
		error?: unknown;
	};
	expect(envelope.error).toBeUndefined();
	return envelope.result;
}
async function login(page: Page, actor: (typeof fixture.actors)[number]) {
	await page.getByLabel("Email address").fill(`${actor.id}@example.test`);
	await page.getByLabel("Password", { exact: true }).fill(actor.password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByTestId("identity")).toHaveText(actor.id);
}
async function pairCount() {
	return (
		await db.listRows({
			databaseId,
			tableId: "follows",
			queries: [
				Query.equal("followerId", a.id),
				Query.equal("followingId", b.id),
			],
		})
	).total;
}

test("follow A/B/anonymous: real UI, direct RPC, concurrent unique pairs, rollback and identity isolation", async ({
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
	await page.goto(`/en/user/${b.id}`);
	await expect(page.getByTestId("follow-counts")).toHaveText(
		"Followers: 0 · Following: 0",
	);
	const mutation = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await page.getByRole("button", { name: "Follow", exact: true }).click();
	const mutationUrl = (await mutation).url();
	await expect(
		page.getByRole("button", { name: "Unfollow", exact: true }),
	).toBeEnabled();
	await expect(page.getByTestId("follow-counts")).toHaveText(
		"Followers: 1 · Following: 0",
	);
	const call = async (
		data: unknown,
		secret = a.secret,
		extra: Record<string, string> = {},
	) =>
		result<{ ok: true; value: FollowChange } | { ok: false; error: string }>(
			await request.post(mutationUrl, {
				headers: headers(secret, extra),
				data: body(data),
			}),
		);
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Unfollow", exact: true }),
	).toBeVisible();
	expect(await pairCount()).toBe(1);
	for (const [data, secret, extra, error] of [
		[{ id: b.id, following: true }, "", {}, "unauthorized"],
		[{ id: a.id, following: true }, a.secret, {}, "forbidden"],
		[{ id: b.id, following: true, followerId: b.id }, a.secret, {}, "invalid"],
		[{ id: b.id, following: true, role: "admin" }, a.secret, {}, "invalid"],
		[
			{ id: b.id, following: true },
			a.secret,
			{ Origin: "https://evil.test" },
			"origin",
		],
		[{ id: b.id, following: true }, a.secret, { Origin: "" }, "origin"],
		[{ id: "hidden-profile", following: true }, admin.secret, {}, "forbidden"],
		[{ id: "missing-profile", following: true }, a.secret, {}, "forbidden"],
	] as const)
		expect(await call(data, secret, extra)).toEqual({ ok: false, error });
	expect(await pairCount()).toBe(1);
	// Duplicate replays neither mutate the edge nor emit a new business event.
	expect(await call({ id: b.id, following: true })).toMatchObject({
		ok: true,
		value: { event: null },
	});
	await call({ id: b.id, following: false });
	const concurrent = await Promise.all(
		Array.from({ length: 12 }, () => call({ id: b.id, following: true })),
	);
	expect(concurrent.every((r) => r.ok)).toBe(true);
	const events = concurrent.flatMap((r) =>
		r.ok && r.value.event ? [r.value.event] : [],
	);
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({
		version: 1,
		type: "FOLLOW_CREATED",
		actorId: a.id,
		recipientId: b.id,
	});
	expect(Object.keys(events[0] ?? {}).sort()).toEqual([
		"actorId",
		"edgeId",
		"eventId",
		"occurredAt",
		"recipientId",
		"type",
		"version",
	]);
	expect(await pairCount()).toBe(1);
	const removes = await Promise.all(
		Array.from({ length: 12 }, () => call({ id: b.id, following: false })),
	);
	expect(removes.every((r) => r.ok)).toBe(true);
	expect(removes.filter((r) => r.ok && r.value.event)).toHaveLength(1);
	expect(await pairCount()).toBe(0);
	// Opposing requests may linearize either way. The authoritative reload must
	// match the persisted unique pair rather than preserve a guessed client order.
	await Promise.all(
		Array.from({ length: 8 }, (_, i) =>
			call({ id: b.id, following: i % 2 === 0 }),
		),
	);
	await page.reload();
	const count = await pairCount();
	expect(count).toBeLessThanOrEqual(1);
	await expect(page.getByTestId("follow-counts")).toHaveText(
		`Followers: ${count} · Following: 0`,
	);
	await call({ id: b.id, following: false });
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Follow", exact: true }),
	).toBeEnabled();
	// An actual rejected write rolls back the optimistic counter and button.
	await page.route(mutationUrl, (route) => route.abort());
	await page.getByRole("button", { name: "Follow", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Follows are unavailable",
	);
	await expect(
		page.getByRole("button", { name: "Follow", exact: true }),
	).toBeEnabled();
	await expect(page.getByTestId("follow-counts")).toHaveText(
		"Followers: 0 · Following: 0",
	);
	expect(await pairCount()).toBe(0);
	await page.unroute(mutationUrl);
	await page.getByRole("button", { name: "Follow", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Unfollow", exact: true }),
	).toBeEnabled();
	await page.goto(`/fr/user/${b.id}`);
	await expect(
		page.getByRole("button", { name: "Ne plus suivre", exact: true }),
	).toBeVisible();
	await expect(page.getByTestId("follow-counts")).toHaveText(
		"Abonnés: 1 · Abonnements: 0",
	);
	// B owns its request identity even when replaying an endpoint captured by A.
	expect(await call({ id: a.id, following: true }, b.secret)).toMatchObject({
		ok: true,
		value: {
			state: { viewerId: b.id, following: true },
			event: { actorId: b.id, recipientId: a.id },
		},
	});
	await page.goto(`/en/user/${a.id}`);
	const listCall = page.waitForRequest(
		(r) =>
			r.url().includes("/_serverFn/") &&
			decodeURIComponent(r.url()).includes('"direction"'),
	);
	await page.getByRole("link", { name: "My follows", exact: true }).click();
	const listUrl = (await listCall).url();
	await expect(page.getByRole("heading", { name: "My follows" })).toBeVisible();
	await expect(
		page.getByRole("link", { name: `Public ${b.id}`, exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Show more" }).click();
	await expect(
		page.getByRole("link", { name: "Public person-21", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
	const list = await result<{ ok: true; value: FollowPage }>(
		await request.get(listUrl, { headers: headers(b.secret) }),
	);
	expect(list).toMatchObject({ ok: true, value: { viewerId: b.id } });
	expect(list.value.profiles.map((p) => p.id)).toEqual([a.id]);
	expect(
		await result(await request.get(listUrl, { headers: headers("") })),
	).toEqual({ ok: false, error: "unauthorized" });
	const forgedUrl = new URL(listUrl);
	forgedUrl.searchParams.set(
		"payload",
		JSON.stringify(toJSON({ data: { direction: "following", userId: a.id } })),
	);
	expect(
		await result(
			await request.get(forgedUrl.href, { headers: headers(b.secret) }),
		),
	).toEqual({ ok: false, error: "invalid" });
	const html = await (await request.get(`/en/user/${b.id}`)).text();
	for (const secret of secrets) expect(html.includes(secret)).toBe(false);
	const guest = await browser.newContext();
	const guestPage = await guest.newPage();
	await guestPage.goto(`${origin}/en/user/${b.id}`);
	await expect(
		guestPage.getByRole("link", { name: "Sign in to follow this profile" }),
	).toBeVisible();
	await expect(guestPage.getByTestId("follow-counts")).toHaveText(
		"Followers: 1 · Following: 1",
	);
	await guestPage.goto(`${origin}/en/profile/follows`);
	await expect(guestPage).toHaveURL(/\/en\/sign-in/);
	await guest.close();
	// Session client has read-only ACL; no forged direct Appwrite writes.
	for (const client of [base(), base().setSession(a.secret)]) {
		let code = 0;
		try {
			await new TablesDB(client).createRow({
				databaseId,
				tableId: "follows",
				rowId: "forged-edge",
				data: {
					followerId: b.id,
					followingId: "person-00",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				permissions: [Permission.read(Role.any())],
			});
		} catch (e) {
			code = (e as { code: number }).code;
		}
		expect([401, 403]).toContain(code);
	}
	// Same-tab signout and sign-in run the real identity cache lifecycle.
	await page.getByRole("link", { name: "My space", exact: true }).click();
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(page).toHaveURL(/\/en\/sign-in/);
	await login(page, b);
	await page.getByRole("link", { name: "My profile", exact: true }).click();
	await page.getByRole("link", { name: "My follows", exact: true }).click();
	await expect(
		page.getByRole("link", { name: `Public ${a.id}`, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Public person-00", exact: true }),
	).toHaveCount(0);
	await page.getByRole("link", { name: "Followers", exact: true }).click();
	await expect(
		page.getByRole("link", { name: `Public ${a.id}`, exact: true }),
	).toBeVisible();
	expect(errors).toEqual([]);
});
