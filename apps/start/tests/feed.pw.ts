import { readdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { databaseId } from "../scripts/feed-capabilities";
import { endpoint, state } from "../scripts/feed-local";
import type {
	ExploreResult,
	FeedPage,
	FeedResult,
	PublicPost,
} from "../src/lib/feed-contract";

const testRoot = dirname(fileURLToPath(import.meta.url));
const origin = "http://127.0.0.1:3554";
const config = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; secret: string; password: string; type: string }[];
	ids: string[];
};
const base = () =>
	new Client().setEndpoint(endpoint).setProject(config.project);
const admin = new TablesDB(base().setKey(config.proofKey)),
	anon = new TablesDB(base());
const secrets = [
	config.proofKey,
	config.readerKey,
	config.sessionKey,
	config.writerKey,
	...fixture.actors.flatMap((a) => [a.secret, a.password]),
	"PRIVATE-OBJECT-KEY",
	"private-fixture-bucket",
	"PRIVATE-COMMENT-TEXT",
	"PRIVATE-FULL-NAME",
];
const ids = [...fixture.ids].sort().reverse();
function noLeaks(text: string) {
	for (const secret of secrets) expect(text.includes(secret)).toBe(false);
	for (const field of [
		"spamScore",
		"birthday",
		"objectKey",
		"versionId",
		"checksum",
	])
		expect(text.includes(`"${field}"`)).toBe(false);
}
test.beforeAll(async () => {
	await admin.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "feed-post-038",
		data: { publishedAt: null },
	});
	await admin.updateTable({
		databaseId,
		tableId: "posts",
		enabled: true,
		rowSecurity: true,
		permissions: [],
	});
	await admin.updateRow({
		databaseId,
		tableId: "profiles",
		rowId: "feed-actor-1",
		data: { isOnboarded: true },
		permissions: [Permission.read(Role.any())],
	});
});
const functionIds = new Map<string, string>();
async function endpointFor(name: string) {
	if (functionIds.has(name))
		return `${origin}/_serverFn/${functionIds.get(name)}`;
	for (const path of await readdir(`${testRoot}/../dist/server/assets`)) {
		const text = await readFile(
				`${testRoot}/../dist/server/assets/${path}`,
				"utf8",
			),
			match = text.match(
				new RegExp(
					`var ${name} = createServerFn\\([\\s\\S]*?createSsrRpc\\("([a-f0-9]+)"`,
				),
			);
		if (match) {
			functionIds.set(name, match[1]!);
			return `${origin}/_serverFn/${match[1]}`;
		}
	}
	throw new Error(`Built RPC missing: ${name}`);
}
async function call<T>(
	request: APIRequestContext,
	name: string,
	data: unknown,
	actor = -1,
	trace = "",
) {
	const url = new URL(await endpointFor(name));
	url.searchParams.set("payload", JSON.stringify(toJSON({ data })));
	const r = await request.get(url.toString(), {
		headers: {
			"x-tsr-serverfn": "true",
			Origin: origin,
			"sec-fetch-site": "same-origin",
			Accept: "application/json",
			Cookie:
				actor < 0 ? "" : `nfe-session-dev=${fixture.actors[actor]!.secret}`,
			"x-nfe-proof-trace": trace,
		},
	});
	const text = await r.text();
	noLeaks(text);
	const envelope = fromCrossJSON(JSON.parse(text), {}) as {
		result: FeedResult<T>;
		error?: unknown;
	};
	return { status: r.status(), headers: r.headers(), ...envelope };
}
async function feed(
	request: APIRequestContext,
	input: object = {},
	actor = -1,
	trace = "",
) {
	const r = await call<FeedPage>(request, "getFeed", input, actor, trace);
	expect(r.status).toBe(200);
	expect(r.result.ok).toBe(true);
	if (!r.result.ok) throw new Error(r.result.error);
	return r.result.value;
}
async function explore(
	request: APIRequestContext,
	input: object = {},
	actor = -1,
	trace = "",
) {
	const r = await call<ExploreResult>(
		request,
		"getExplore",
		input,
		actor,
		trace,
	);
	expect(r.status).toBe(200);
	expect(r.result.ok).toBe(true);
	if (!r.result.ok) throw new Error(r.result.error);
	return r.result.value;
}
async function mutate(
	request: APIRequestContext,
	name: string,
	data: unknown,
	actor: number,
) {
	const r = await request.post(await endpointFor(name), {
		headers: {
			"x-tsr-serverfn": "true",
			Origin: origin,
			"sec-fetch-site": "same-origin",
			Accept: "application/json",
			"Content-Type": "application/json",
			Cookie: `nfe-session-dev=${fixture.actors[actor]!.secret}`,
		},
		data: JSON.stringify(toJSON({ data })),
	});
	const text = await r.text();
	noLeaks(text);
	expect(r.status()).toBe(200);
	const e = fromCrossJSON(JSON.parse(text), {}) as { result: { ok: boolean } };
	if (!e.result.ok)
		throw new Error(`Profile RPC failed: ${JSON.stringify(e.result)}`);
}
async function denied(run: () => Promise<unknown>) {
	let code = 0;
	try {
		await run();
	} catch (e) {
		code = (e as { code: number }).code;
	}
	expect([401, 403, 404]).toContain(code);
}

test("SDK and RPC: all actors, exact grouped counts, stable seeks, filter binding, hidden children", async ({
	request,
}) => {
	for (const actor of [-1, 0, 1, 4]) {
		const db =
			actor < 0
				? anon
				: new TablesDB(base().setSession(fixture.actors[actor]!.secret));
		const first = await feed(
			request,
			{ limit: 10 },
			actor,
			`structure-${actor}-10`,
		);
		expect(first.posts.map((p) => p.id)).toEqual(ids.slice(0, 10));
		expect(first.posts[0]!._count).toEqual({ likes: 131, comments: 101 });
		const zero = await feed(
			request,
			{ limit: 1, authorId: "feed-actor-0" },
			actor,
			`structure-${actor}-zero`,
		);
		expect(zero.posts[0]!._count).toEqual({ likes: 0, comments: 0 });
		const single = await feed(
			request,
			{ limit: 1 },
			actor,
			`structure-${actor}-1`,
		);
		expect(single.posts[0]!.id).toBe(ids[0]);
		const full = await feed(
			request,
			{ limit: 20 },
			actor,
			`structure-${actor}-20`,
		);
		expect(full.posts).toHaveLength(20);
		for (const hidden of [
			"feed-post-040",
			"feed-post-041",
			"feed-post-042",
			"feed-post-043",
			"feed-post-044",
			"absent-post",
		]) {
			const r = await call<PublicPost | null>(
				request,
				"getPost",
				{ id: hidden },
				actor,
				`hidden-${actor}-${hidden}`,
			);
			expect(r.status).toBe(404);
			expect(r.result).toEqual({ ok: true, value: null });
		}
		// Direct ACLs are still enforced even for native aggregation, not just UI.
		const grouped = await db.listRows({
			databaseId,
			tableId: "likes",
			queries: [
				Query.equal("postId", ["feed-post-039", "feed-post-040"]),
				Query.groupBy(["postId"]),
				Query.count("$id", "count"),
				Query.limit(10),
			],
			total: false,
		});
		expect(grouped.rows).toEqual([]);
		if (actor < 0 || actor === 1)
			await denied(() =>
				db.getRow({ databaseId, tableId: "media", rowId: "media-40" }),
			);
		if (actor < 0)
			await denied(() =>
				db.getRow({ databaseId, tableId: "posts", rowId: "feed-post-040" }),
			);
		if (actor !== 4)
			await denied(() =>
				db.getRow({
					databaseId,
					tableId: "post_private",
					rowId: "feed-post-039",
				}),
			);
	}
	for (const limit of [1, 2, 10, 20]) {
		let cursor: string | null = null;
		const found: string[] = [];
		let pages = 0;
		do {
			const result = await feed(request, { limit, cursor });
			found.push(...result.posts.map((p) => p.id));
			cursor = result.nextCursor;
			pages++;
			expect(pages).toBeLessThanOrEqual(41);
		} while (cursor);
		expect(found).toEqual(ids);
		expect(new Set(found).size).toBe(40);
		expect(pages).toBe(Math.ceil(40 / limit));
	}
	const first = await feed(request, { limit: 10 });
	for (const change of [
		{ limit: 2 },
		{ q: "paris" },
		{ authorId: fixture.actors[0]!.id },
	]) {
		const r = await call(request, "getFeed", {
			limit: 10,
			cursor: first.nextCursor,
			...change,
		});
		expect(r.result).toEqual({ ok: false, error: "invalid" });
	}
	for (const author of fixture.actors) {
		const page = await feed(request, { authorId: author.id, limit: 20 });
		expect(
			page.posts.every(
				(p) => p.userId === author.id && p.status === "PUBLISHED",
			),
		).toBe(true);
		expect(page.posts).toHaveLength(8);
	}
	// A newly published head does not change the position encoded in an existing cursor.
	const template = await admin.getRow({
		databaseId,
		tableId: "posts",
		rowId: "feed-post-039",
	});
	const newData = Object.fromEntries(
		Object.entries(template).filter(([key]) => !key.startsWith("$")),
	);
	await admin.createRow({
		databaseId,
		tableId: "posts",
		rowId: "feed-new-head",
		data: {
			...newData,
			slug: "feed-new-head",
			createdAt: "2026-02-01T00:00:00.000Z",
		},
		permissions: [Permission.read(Role.any())],
	});
	try {
		expect(
			(await feed(request, { limit: 10, cursor: first.nextCursor })).posts.map(
				(p) => p.id,
			),
		).toEqual(ids.slice(10, 20));
	} finally {
		await admin.deleteRow({
			databaseId,
			tableId: "posts",
			rowId: "feed-new-head",
		});
	}
	// PUBLISHED status does not override an ACL revocation, including for an owner/admin.
	await admin.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "feed-post-039",
		permissions: [Permission.read(Role.user(String(template.userId)))],
	});
	try {
		for (const actor of [-1, 0, 1, 4]) {
			const r = await call(
				request,
				"getPost",
				{ id: "feed-post-039" },
				actor,
				`hidden-revoked-${actor}`,
			);
			expect(r.status).toBe(404);
			expect(r.result).toEqual({ ok: true, value: null });
		}
	} finally {
		await admin.updateRow({
			databaseId,
			tableId: "posts",
			rowId: "feed-post-039",
			permissions: [Permission.read(Role.any())],
		});
	}
	// Delete and depublish the pivot without looking it up: continuation remains exact.
	const pivot = first.posts.at(-1)!;
	await admin.updateRow({
		databaseId,
		tableId: "posts",
		rowId: pivot.id,
		data: { status: "DRAFT" },
		permissions: [Permission.read(Role.user(pivot.userId))],
	});
	try {
		expect(
			(await feed(request, { limit: 10, cursor: first.nextCursor })).posts.map(
				(p) => p.id,
			),
		).toEqual(ids.slice(10, 20));
	} finally {
		await admin.updateRow({
			databaseId,
			tableId: "posts",
			rowId: pivot.id,
			data: { status: "PUBLISHED" },
			permissions: [Permission.read(Role.any())],
		});
	}
	const saved = await admin.getRow({
		databaseId,
		tableId: "posts",
		rowId: pivot.id,
	});
	const data = Object.fromEntries(
		Object.entries(saved).filter(([key]) => !key.startsWith("$")),
	);
	await admin.deleteRow({ databaseId, tableId: "posts", rowId: pivot.id });
	try {
		expect(
			(await feed(request, { limit: 10, cursor: first.nextCursor })).posts.map(
				(p) => p.id,
			),
		).toEqual(ids.slice(10, 20));
	} finally {
		await admin.createRow({
			databaseId,
			tableId: "posts",
			rowId: pivot.id,
			data,
			permissions: saved.$permissions,
		});
	}
	// Backend failures differ from an empty page and hidden/absent detail.
	await admin.updateTable({
		databaseId,
		tableId: "posts",
		enabled: false,
		rowSecurity: true,
		permissions: [],
	});
	try {
		const r = await call(request, "getFeed", {});
		expect(r.result).toEqual({ ok: false, error: "unavailable" });
		const detail = await call(request, "getPost", { id: "feed-post-039" });
		expect(detail.result).toEqual({ ok: false, error: "unavailable" });
		expect(detail.status).toBe(200);
	} finally {
		await admin.updateTable({
			databaseId,
			tableId: "posts",
			enabled: true,
			rowSecurity: true,
			permissions: [],
		});
	}
});

test("search: NFC, case, internal substrings, union, nullable dates, bounded suggestions and hidden tabs", async ({
	request,
}) => {
	for (const q of ["ÉQUIPE", "E\u0301QUIPE", "qui"]) {
		const r = await explore(
			request,
			{ q, tab: "posts" },
			-1,
			`structure-search-${q === "qui" ? "substring" : "unicode"}`,
		);
		expect(r.posts).toHaveLength(10);
		expect(r.users).toEqual([]);
	}
	const union = await feed(request, { q: "paris", limit: 20 });
	expect(new Set(union.posts.map((p) => p.id)).size).toBe(20);
	let cursor: string | null = null,
		all: string[] = [];
	do {
		const r = await feed(request, { q: "équipe", limit: 2, cursor });
		all.push(...r.posts.map((p) => p.id));
		cursor = r.nextCursor;
	} while (cursor);
	expect(all).toEqual(ids);
	expect(new Set(all).size).toBe(40);
	for (const q of ["%", "_", "\\"]) {
		expect((await explore(request, { q, tab: "posts" })).posts).toEqual([]);
	}
	const apostrophe = await explore(request, { q: "D’OUEST", tab: "posts" });
	expect(apostrophe.posts.map((p) => p.id)).toEqual(["feed-post-002"]);
	expect(await explore(request, { q: "zzzzz", tab: "top" })).toEqual({
		users: [],
		posts: [],
	});
	const users = await explore(
		request,
		{ q: "QUIPE", tab: "users" },
		-1,
		"structure-users-only",
	);
	expect(users.users.map((u) => u.id)).toEqual(["feed-actor-0"]);
	expect(users.posts).toEqual([]);
	const suggestions = await explore(
		request,
		{ q: " ", tab: "users" },
		0,
		"structure-suggestions-A",
	);
	expect(suggestions.users).toHaveLength(10);
	expect(
		suggestions.users.every(
			(u) =>
				u.id !== "feed-actor-0" &&
				!Array.from(
					{ length: 32 },
					(_, i) => `suggestion-${String(44 - i).padStart(3, "0")}`,
				).includes(u.id),
		),
	).toBe(true);
	const b = await explore(
		request,
		{ q: "", tab: "users" },
		1,
		"structure-suggestions-B",
	);
	expect(b.users.map((u) => u.id)).not.toEqual(
		suggestions.users.map((u) => u.id),
	);
	// Invalid request controls never become private Prisma/Appwrite filters.
	for (const input of [
		{ limit: 21 },
		{ status: "DRAFT" },
		{ viewerId: fixture.actors[0]!.id },
		{ q: "a".repeat(129) },
	]) {
		const r = await request.get(
			`${await endpointFor("getFeed")}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data: input })))}`,
			{ headers: { "x-tsr-serverfn": "true", Accept: "application/json" } },
		);
		expect(r.ok()).toBe(false);
		noLeaks(await r.text());
	}
});

test("production browser: SSR hydration, network retry, FR/EN deep URLs and A/B cache", async ({
	page,
	context,
	browser,
	request,
}) => {
	const errors: string[] = [],
		rpc: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("request", (r) => {
		if (r.url().includes("/_serverFn/")) rpc.push(r.url());
	});
	const document = await page.goto("/fr/feed");
	expect(document!.status()).toBe(200);
	const html = await document!.text();
	noLeaks(html);
	expect(html).toContain("Équipe Paris 39");
	await expect(page.locator("[data-post-id]")).toHaveCount(10);
	await page.waitForLoadState("networkidle");
	expect(rpc).toEqual([]);
	await page.getByRole("button", { name: "Voir plus", exact: true }).click();
	await expect(page.locator("[data-post-id]")).toHaveCount(20);
	expect(rpc).toHaveLength(1);
	// Slow page continuation keeps current cards and shows a disabled loading state.
	await page.route("**/_serverFn/**", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 600));
		await route.continue();
	});
	await page.getByRole("button", { name: "Voir plus", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Chargement…", exact: true }),
	).toBeDisabled();
	expect(await page.locator("[data-post-id]").count()).toBe(20);
	await expect(page.locator("[data-post-id]")).toHaveCount(30);
	await page.unroute("**/_serverFn/**");
	await context.setOffline(true);
	await page.getByRole("button", { name: "Voir plus", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("indisponibles");
	expect(await page.locator("[data-post-id]").count()).toBe(30);
	await context.setOffline(false);
	await page.getByRole("button", { name: "Réessayer", exact: true }).click();
	await expect(page.locator("[data-post-id]")).toHaveCount(40);
	expect(
		new Set(
			await page
				.locator("[data-post-id]")
				.evaluateAll((nodes) =>
					nodes.map((n) => n.getAttribute("data-post-id")),
				),
		).size,
	).toBe(40);
	for (const locale of ["fr", "en"]) {
		for (const path of [
			`/${locale}`,
			`/${locale}/post/feed-post-039`,
			`/${locale}/user/feed-actor-0`,
			`/${locale}/explore?q=qui&tab=posts`,
		]) {
			const r = await page.goto(path);
			expect(r!.status()).toBe(200);
			await page.waitForLoadState("networkidle");
			noLeaks(await page.content());
			expect(await page.locator("[data-post-id]").count()).toBeGreaterThan(0);
		}
		const missing = await request.get(`/${locale}/post/feed-post-040`),
			absent = await request.get(`/${locale}/post/absent-post`);
		expect(missing.status()).toBe(404);
		expect(absent.status()).toBe(404);
		noLeaks(await missing.text());
	}
	await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: origin }]);
	for (const [legacy, target] of [
		["/post/feed-post-039", "/en/post/feed-post-039"],
		["/user/feed-actor-0", "/en/user/feed-actor-0"],
		["/explore?q=qui&tab=posts", "/en/explore?q=qui&tab=posts"],
	]) {
		await page.goto(legacy!);
		await expect(page).toHaveURL(`${origin}${target}`);
	}
	await page.goto("/fr/explore?q=qui&tab=users");
	await page
		.getByLabel("Publications et recherche")
		.getByRole("link", { name: "English", exact: true })
		.click();
	await expect(page).toHaveURL(/\/en\/explore\?q=qui&tab=users$/);
	await page.getByLabel("Search", { exact: true }).fill("zzzzz");
	await expect(page).toHaveURL(/q=zzzzz/);
	await expect(page.getByText("No results", { exact: true })).toBeVisible();
	// Concurrent private SSR is scoped per request and cache clears through real logout/login.
	const contexts = await Promise.all(
		[0, 1].map(async (i) => {
			const c = await browser.newContext();
			await c.addCookies([
				{
					name: "nfe-session-dev",
					value: fixture.actors[i]!.secret,
					url: origin,
				},
			]);
			return c;
		}),
	);
	try {
		const pages = await Promise.all(contexts.map((c) => c.newPage()));
		await Promise.all(pages.map((p) => p.goto("/en/explore?tab=users")));
		const names = await Promise.all(
			pages.map((p) => p.locator("main article a").allTextContents()),
		);
		expect(names[0]).not.toEqual(names[1]);
		for (const p of pages) noLeaks(await p.content());
	} finally {
		for (const c of contexts) await c.close();
	}
	// Same browser QueryClient switches A -> sign out -> B without a document reload.
	await context.clearCookies();
	await page.goto("/en/sign-in");
	async function login(actor: number) {
		await page
			.getByLabel("Email address", { exact: true })
			.fill(`feed-actor-${actor}@example.test`);
		await page
			.getByLabel("Password", { exact: true })
			.fill(fixture.actors[actor]!.password);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await expect(page.getByTestId("identity")).toHaveText(
			`feed-actor-${actor}`,
		);
	}
	await login(0);
	await page.getByRole("link", { name: "Home", exact: true }).click();
	await page
		.getByLabel("Posts and search")
		.getByRole("link", { name: "Explore", exact: true })
		.click();
	await expect(page.locator("main article")).toHaveCount(10);
	const namesA = await page.locator("main article a").allTextContents();
	await page.evaluate(() => {
		Object.assign(window, { identityWitness: "same-router" });
	});
	await page.getByRole("link", { name: "My space", exact: true }).click();
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Sign in", exact: true }),
	).toBeVisible();
	await login(1);
	await page.getByRole("link", { name: "Home", exact: true }).click();
	await page
		.getByLabel("Posts and search")
		.getByRole("link", { name: "Explore", exact: true })
		.click();
	await expect(page.locator("main article")).toHaveCount(10);
	expect(await page.locator("main article a").allTextContents()).not.toEqual(
		namesA,
	);
	expect(
		await page.evaluate(() => Reflect.get(window, "identityWitness")),
	).toBe("same-router");

	expect(errors).toEqual([]);
});

test("onboarding and edit writes preserve NFC/case search semantics", async ({
	request,
}) => {
	const actor = fixture.actors[1]!;
	await admin.updateRow({
		databaseId,
		tableId: "profiles",
		rowId: actor.id,
		data: { isOnboarded: false },
		permissions: [Permission.read(Role.user(actor.id))],
	});
	await mutate(
		request,
		"saveOnboarding",
		{
			userType: "PLAYER",
			name: "E\u0301cole Unique",
			city: "Paris",
			biography: "Synthetic",
			birthDate: "2000-01-01",
			position: ["STRIKER"],
			foot: "RIGHT",
			license: "",
		},
		1,
	);
	expect(
		(await admin.getRow({ databaseId, tableId: "profiles", rowId: actor.id }))
			.nameFolded,
	).toBe("école unique");
	for (const q of ["ÉCOLE", "E\u0301COLE", "cole"]) {
		expect(
			(await explore(request, { q, tab: "users" })).users.map((u) => u.id),
		).toEqual([actor.id]);
	}
	await mutate(
		request,
		"saveProfile",
		{
			name: "E\u0301dition Unique",
			biography: null,
			localisation: null,
			fullName: null,
			birthday: null,
			position: [],
			foot: [],
			license: null,
			clubSize: null,
			clubPosition: null,
		},
		1,
	);
	expect(
		(await admin.getRow({ databaseId, tableId: "profiles", rowId: actor.id }))
			.nameFolded,
	).toBe("édition unique");
	for (const q of ["ÉDITION", "E\u0301DITION", "dition"]) {
		expect(
			(await explore(request, { q, tab: "users" })).users.map((u) => u.id),
		).toEqual([actor.id]);
	}
});

test("declared synthetic performance: 100 successful requests per scenario, raw timings and call structure", async ({
	request,
}) => {
	test.skip(
		process.env.NFE_FEED_BENCHMARK !== "1",
		"Synthetic benchmark requires a declared uncontended runtime window",
	);
	const scenarios: {
		name: string;
		function: string;
		data: object;
		actor?: number;
	}[] = [
		{ name: "feed-1", function: "getFeed", data: { limit: 1 } },
		{ name: "feed-10", function: "getFeed", data: { limit: 10 } },
		{ name: "detail", function: "getPost", data: { id: "feed-post-039" } },
		{
			name: "profile-posts",
			function: "getFeed",
			data: { authorId: "feed-actor-0" },
		},
		{
			name: "search-posts",
			function: "getExplore",
			data: { q: "qui", tab: "posts" },
		},
		{
			name: "search-users",
			function: "getExplore",
			data: { q: "person", tab: "users" },
		},
		{
			name: "suggestions-A",
			function: "getExplore",
			data: { q: "", tab: "users" },
			actor: 0,
		},
	];
	const measurements = [];
	for (const s of scenarios) {
		const ms: number[] = [],
			failures: string[] = [];
		for (let i = 0; i < 100; i++) {
			const start = performance.now();
			try {
				const r = await call(
					request,
					s.function,
					s.data,
					s.actor ?? -1,
					`perf-${s.name}-${i}`,
				);
				if (!r.result.ok) failures.push(r.result.error);
				else ms.push(performance.now() - start);
			} catch {
				failures.push("request-failed");
			}
		}
		expect(failures).toEqual([]);
		expect(ms).toHaveLength(100);
		const sorted = [...ms].sort((a, b) => a - b);
		measurements.push({
			...s,
			successes: ms.length,
			failures,
			ms,
			p50: sorted[49],
			p95: sorted[94],
		});
	}
	const documents = [];
	for (const locale of ["fr", "en"]) {
		for (const route of [
			"feed",
			"post/feed-post-039",
			"user/feed-actor-0",
			"explore?q=qui&tab=posts",
		]) {
			const ms: number[] = [];
			for (let i = 0; i < 100; i++) {
				const start = performance.now(),
					r = await request.get(`/${locale}/${route}`);
				expect(r.status()).toBe(200);
				noLeaks(await r.text());
				ms.push(performance.now() - start);
			}
			const sorted = [...ms].sort((a, b) => a - b);
			documents.push({
				locale,
				route,
				successes: ms.length,
				failures: 0,
				ms,
				p50: sorted[49],
				p95: sorted[94],
			});
		}
	}
	await writeFile(
		`${testRoot}/../evidence/feed-performance.json`,
		`${JSON.stringify({ at: new Date().toISOString(), source: "synthetic, not representative", runtime: { bun: "1.3.14 launcher", node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, memoryGiB: totalmem() / 1024 ** 3 }, environment: "loopback macOS host -> isolated Docker Appwrite2.6.2/PostgreSQL; sequential concurrency1; warm backend process; HTTP requests bypass browser Query cache; no claimed cold-cache reset", dataset: { publicPosts: 40, equalTimePosts: 40, privatePosts: 5, publicProfiles: 50, privateProfiles: 1, likes: 150, comments: 121, follows: 32, types: ["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"] }, quantile: "nearest-rank ceil(p*n)", rpc: measurements, ssr: documents, sourceP95: null, approvedProductionBudgets: null, goNoGo: "unmet external gates; no production performance acceptance" }, null, 2)}\n`,
	);
});
