import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { Client, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { databaseId } from "../scripts/post-text-fixtures";
import { endpoint, state } from "../scripts/post-text-local";
import type {
	OwnPost,
	OwnPostsPage,
	PostTextResult,
} from "../src/lib/post-text-contract";

const testRoot = dirname(fileURLToPath(import.meta.url));
const origin = "http://127.0.0.1:3570";
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; email: string; secret: string; password: string }[];
	ids: string[];
};
const admin = new TablesDB(
	new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
);
const secrets = [
	c.proofKey,
	c.postWriterKey,
	c.readerKey,
	c.writerKey,
	c.sessionKey,
	...fixture.actors.flatMap((a) => [a.secret, a.password]),
	"SYNTHETIC-KEY",
	"SYNTHETIC-PRIVATE",
];
function noLeaks(text: string) {
	for (const secret of secrets) expect(text.includes(secret)).toBe(false);
	for (const name of [
		"titleFolded",
		"descriptionFolded",
		"spamScore",
		"objectKey",
		"versionId",
	])
		expect(text.includes(`"${name}"`)).toBe(false);
}
const ids = new Map<string, string>();
async function rpcURL(name: string) {
	if (!ids.has(name))
		for (const file of await readdir(`${testRoot}/../dist/server/assets`)) {
			const text = await readFile(
				`${testRoot}/../dist/server/assets/${file}`,
				"utf8",
			);
			const start = text.indexOf(`var ${name} = createServerFn(`);
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
async function call<T>(
	request: APIRequestContext,
	name: string,
	data: unknown,
	actor = -1,
	method = "GET",
	badOrigin = false,
) {
	const url = new URL(await rpcURL(name));
	const headers = {
		"x-tsr-serverfn": "true",
		Origin: badOrigin ? "https://evil.example" : origin,
		"sec-fetch-site": "same-origin",
		Accept: "application/json",
		Cookie: actor < 0 ? "" : `nfe-session-dev=${fixture.actors[actor]!.secret}`,
	};
	const payload = JSON.stringify(toJSON({ data }));
	if (method === "GET") url.searchParams.set("payload", payload);
	const r = await request.fetch(url.toString(), {
		method,
		headers: {
			...headers,
			...(method === "POST" ? { "Content-Type": "application/json" } : {}),
		},
		...(method === "POST" ? { data: payload } : {}),
	});
	const text = await r.text();
	noLeaks(text);
	const e = fromCrossJSON(JSON.parse(text), {}) as {
		result: PostTextResult<T>;
	};
	expect(r.headers()["cache-control"]).toBe("private, no-store");
	return e.result;
}
async function own(request: APIRequestContext, id: string, actor = 0) {
	const r = await call<OwnPost>(request, "getOwnPost", { id }, actor);
	expect(r.ok).toBe(true);
	if (!r.ok) throw new Error(r.error);
	return r.value;
}
async function raw(id: string) {
	return admin.getRow({ databaseId, tableId: "posts", rowId: id });
}
function edit(p: OwnPost, title: string) {
	return {
		id: p.id,
		expectedRevision: p.revision,
		title,
		description: "  ÉDITION Description  ",
	};
}
function stable(row: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(row).filter(
			([key]) =>
				![
					"title",
					"description",
					"titleFolded",
					"descriptionFolded",
					"updatedAt",
					"$updatedAt",
				].includes(key),
		),
	);
}

test("direct RPC: bounded owner-only pagination, all statuses, anonymous/forged actor/cursor/SSR denied", async ({
	request,
}) => {
	const found: OwnPost[] = [];
	let cursor: string | null = null;
	do {
		const r: PostTextResult<OwnPostsPage> = await call<OwnPostsPage>(
			request,
			"getOwnPosts",
			{ limit: 7, cursor },
			0,
		);
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.error);
		expect(r.value.posts.length).toBeLessThanOrEqual(7);
		expect(r.value.ownerId).toBe("owner-A");
		found.push(...r.value.posts);
		cursor = r.value.nextCursor;
	} while (cursor);
	expect(found.map((p) => p.id)).toEqual(fixture.ids.slice(0, 24).reverse());
	expect(new Set(found.map((p) => p.status))).toEqual(
		new Set(["DRAFT", "PUBLISHED", "PENDING", "REJECTED", "ARCHIVED", null]),
	);
	for (const name of ["getOwnPosts", "getOwnPost"])
		expect(
			await call(
				request,
				name,
				name === "getOwnPosts" ? {} : { id: fixture.ids[0] },
			),
		).toEqual({ ok: false, error: "unauthorized" });
	for (const data of [
		{ limit: 21 },
		{ limit: 0 },
		{ ownerId: "owner-A" },
		{ userId: "owner-A" },
		{ role: "admin" },
		{ cursor: "not-json" },
	])
		expect(await call(request, "getOwnPosts", data, 1)).toEqual({
			ok: false,
			error: "invalid",
		});
	const first = await call<OwnPostsPage>(
		request,
		"getOwnPosts",
		{ limit: 1 },
		0,
	);
	if (!first.ok) throw new Error(first.error);
	expect(
		await call(
			request,
			"getOwnPosts",
			{ limit: 1, cursor: first.value.nextCursor },
			1,
		),
	).toEqual({ ok: false, error: "invalid" });
	for (const actor of [1, 2]) {
		const r = await call<OwnPostsPage>(request, "getOwnPosts", {}, actor);
		if (!r.ok) throw new Error(r.error);
		expect(
			r.value.posts.every((p) => p.userId === fixture.actors[actor]!.id),
		).toBe(true);
		expect(
			await call(request, "getOwnPost", { id: fixture.ids[0] }, actor),
		).toEqual({ ok: false, error: "notFound" });
	}
	for (const locale of ["fr", "en"])
		for (const path of ["post/my", `post/${fixture.ids[0]}/edit`]) {
			const response = await request.get(`${origin}/${locale}/${path}`, {
				maxRedirects: 0,
			});
			const html = await response.text();
			expect(html).not.toContain("Original 0");
			expect(response.headers()["cache-control"]).toContain("no-store");
			noLeaks(html);
		}
});
test("text RPC: owner/session/Origin/bounds, stable metadata/media, atomic folded search and explicit replay/concurrent conflicts", async ({
	request,
}) => {
	const p = await own(request, fixture.ids[0]!);
	const before = await raw(p.id);
	const data = edit(p, "  ÉQUIPE Nouvelle  ");
	for (const actor of [-1, 1, 2]) {
		const r = await call(request, "savePostText", data, actor, "POST");
		expect(r.ok).toBe(false);
	}
	for (const field of [
		"ownerId",
		"userId",
		"role",
		"status",
		"media",
		"slug",
		"publishedAt",
	])
		expect(
			await call(
				request,
				"savePostText",
				{ ...data, [field]: "forged" },
				0,
				"POST",
			),
		).toEqual({ ok: false, error: "invalid" });
	for (const patch of [
		{ title: " " },
		{ title: "x".repeat(201) },
		{ description: "x".repeat(10001) },
	])
		expect(
			await call(request, "savePostText", { ...data, ...patch }, 0, "POST"),
		).toEqual({ ok: false, error: "invalid" });
	expect(await call(request, "savePostText", data, 0, "POST", true)).toEqual({
		ok: false,
		error: "origin",
	});
	expect(await raw(p.id)).toEqual(before);
	for (let i = 0; i < 6; i++) {
		const row = await own(request, fixture.ids[i]!);
		const previous = await raw(row.id);
		const media = await admin.getRow({
			databaseId,
			tableId: "media",
			rowId: `text-media-${i}`,
		});
		const result = await call<OwnPost>(
			request,
			"savePostText",
			edit(row, `  ÉQUIPE Nouvelle ${i}  `),
			0,
			"POST",
		);
		expect(result.ok).toBe(true);
		const after = await raw(row.id);
		expect(after.title).toBe(`ÉQUIPE Nouvelle ${i}`);
		expect(after.titleFolded).toBe(`équipe nouvelle ${i}`);
		expect(after.description).toBe("ÉDITION Description");
		expect(after.descriptionFolded).toBe("édition description");
		expect(stable(after)).toEqual(stable(previous));
		expect(
			await admin.getRow({
				databaseId,
				tableId: "media",
				rowId: `text-media-${i}`,
			}),
		).toEqual(media);
		expect(
			await call(request, "savePostText", edit(row, "Replay stale"), 0, "POST"),
		).toEqual({ ok: false, error: "conflict" });
		expect(await raw(row.id)).toEqual(after);
	}
	const latest = await own(request, p.id);
	const results = await Promise.all([
		call(request, "savePostText", edit(latest, "Concurrent A"), 0, "POST"),
		call(request, "savePostText", edit(latest, "Concurrent B"), 0, "POST"),
	]);
	expect(results.filter((r) => r.ok)).toHaveLength(1);
	expect(results.filter((r) => !r.ok)).toEqual([
		{ ok: false, error: "conflict" },
	]);
	const search = await call<{ posts: { id: string }[] }>(
		request,
		"getExplore",
		{ q: "ÉQUIPE Nouvelle 1", tab: "posts" },
	);
	if (!search.ok) throw new Error(search.error);
	expect(search.value.posts.map((p) => p.id)).toEqual([fixture.ids[1]]);
	// Backend failure does not replace persisted data.
	const snapshot = await raw(p.id);
	const current = await own(request, p.id);
	await admin.updateTable({
		databaseId,
		tableId: "posts",
		enabled: false,
		rowSecurity: true,
		permissions: [],
	});
	try {
		expect(
			await call(
				request,
				"savePostText",
				edit(current, "Must not persist"),
				0,
				"POST",
			),
		).toEqual({ ok: false, error: "unavailable" });
	} finally {
		await admin.updateTable({
			databaseId,
			tableId: "posts",
			enabled: true,
			rowSecurity: true,
			permissions: [],
		});
	}
	expect(await raw(p.id)).toEqual(snapshot);
});
test("FR/EN browser: edit, conflict retention, reload/back/list/feed/detail/profile/search invalidation and account switch", async ({
	page,
	context,
	request,
}) => {
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: fixture.actors[0]!.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	for (const locale of ["fr", "en"]) {
		const title = locale === "fr" ? "Titre" : "Title",
			description = "Description",
			save = locale === "fr" ? "Enregistrer" : "Save";
		const id = fixture.ids[1]!;
		const link = async (href: string) => {
			await page.locator(`a[href="${href}"]`).first().click();
		};
		const mine = async () => {
			await link(`/${locale}/private`);
			await link(`/${locale}/profile`);
			await page
				.getByRole("link", {
					name: locale === "fr" ? "Mes publications" : "My posts",
					exact: true,
				})
				.click();
		};
		const next = async () =>
			page
				.getByRole("link", {
					name: locale === "fr" ? "Page suivante" : "Next page",
					exact: true,
				})
				.click();
		// Warm real Query and loader caches in one mounted router/document.
		await page.goto(`/${locale}/feed`);
		await page.evaluate(() => {
			(window as Window & { postTextDocument?: string }).postTextDocument =
				"mounted";
		});
		await link(`/${locale}/post/${id}`);
		await expect(
			page.getByRole("heading", { name: "ÉQUIPE Nouvelle 1" }),
		).toBeVisible();
		await link(`/${locale}/user/owner-A`);
		await expect(page.locator(`[data-post-id="${id}"]`)).toContainText(
			"ÉQUIPE Nouvelle 1",
		);
		await link(`/${locale}/explore?q=&tab=top`);
		await page.getByRole("searchbox").fill("nouvelle");
		await expect(page).toHaveURL(/q=nouvelle/);
		await expect(page.locator(`[data-post-id="${id}"]`)).toBeVisible();
		await link(`/${locale}/explore?q=nouvelle&tab=posts`);
		await expect(page.locator(`[data-post-id="${id}"]`)).toBeVisible();
		await mine();
		await expect(page.getByTestId("own-post")).toHaveCount(10);
		await next();
		await expect(page.getByTestId("own-post")).toHaveCount(10);
		await next();
		await page.locator(`a[href="/${locale}/post/${id}/edit"]`).click();
		expect(
			await page.evaluate(
				() =>
					(window as Window & { postTextDocument?: string }).postTextDocument,
			),
		).toBe("mounted");
		// The actual DOM must expose a distinct label independent of textarea content.
		await expect(page.locator("label[for=post-text-description]")).toHaveText(
			"Description",
		);
		await expect(page.getByLabel(description, { exact: true })).toHaveCount(1);
		const value = `Browser ${locale} Équipe`;
		await page.getByLabel(title, { exact: true }).fill(`  ${value}  `);
		await page
			.getByLabel(description, { exact: true })
			.fill(`  Browser description ${locale}  `);
		await page.getByRole("button", { name: save, exact: true }).click();
		await expect(page.getByRole("status")).toHaveText(
			locale === "fr" ? "Texte enregistré." : "Text saved.",
		);
		await expect(page.getByLabel(title, { exact: true })).toHaveValue(value);
		// Visit warmed public caches before a document reload can mask stale data.
		await mine();
		await next();
		await next();
		await expect(page.getByText(value, { exact: true })).toBeVisible();
		await page.goBack();
		await page.goBack();
		await page.goBack();
		await page.goBack();
		await page.goBack();
		await expect(page.getByLabel(title, { exact: true })).toHaveValue(value);
		await link(`/${locale}/post/my?cursor=null`);
		await link(`/${locale}/profile`);
		await link(`/${locale}/user/owner-A`);
		await expect(page.locator(`[data-post-id="${id}"]`)).toContainText(value);
		await link(`/${locale}/feed`);
		await expect(page.locator(`[data-post-id="${id}"]`)).toContainText(value);
		await link(`/${locale}/post/${id}`);
		await expect(page.getByRole("heading", { name: value })).toBeVisible();
		await link(`/${locale}/explore?q=&tab=top`);
		await page.getByRole("searchbox").fill("nouvelle");
		await expect(page).toHaveURL(/q=nouvelle/);
		await expect(page.locator(`[data-post-id="${id}"]`)).toHaveCount(0);
		await link(`/${locale}/explore?q=nouvelle&tab=posts`);
		await expect(page.locator(`[data-post-id="${id}"]`)).toHaveCount(0);
		await page.getByRole("searchbox").fill(`browser ${locale}`);
		await expect(page).toHaveURL(new RegExp(`q=browser(?:%20|\\+)${locale}`));
		await expect(page.locator(`[data-post-id="${id}"]`)).toContainText(value);
		expect(
			await page.evaluate(
				() =>
					(window as Window & { postTextDocument?: string }).postTextDocument,
			),
		).toBe("mounted");
		await mine();
		await next();
		await next();
		await page.locator(`a[href="/${locale}/post/${id}/edit"]`).click();
		await page.reload();
		await expect(page.getByRole("status")).toHaveCount(0);
		await expect(page.getByLabel(title, { exact: true })).toHaveValue(value);
		await expect(page.getByLabel(description, { exact: true })).toHaveValue(
			`Browser description ${locale}`,
		);
		const live = await own(request, id);
		await call(
			request,
			"savePostText",
			edit(live, `External ${locale}`),
			0,
			"POST",
		);
		await page.getByLabel(title, { exact: true }).fill("Unsaved local text");
		await page.getByRole("button", { name: save, exact: true }).click();
		await expect(page.getByRole("alert")).toContainText(
			locale === "fr" ? "a changé" : "has changed",
		);
		await expect(page.getByLabel(title, { exact: true })).toHaveValue(
			"Unsaved local text",
		);
		await page
			.getByRole("button", {
				name:
					locale === "fr"
						? "Recharger la version actuelle"
						: "Reload current version",
			})
			.click();
		await expect(page.getByLabel(title, { exact: true })).toHaveValue(
			`External ${locale}`,
		);
		await page.getByLabel(title, { exact: true }).fill(value);
		await page.getByRole("button", { name: save, exact: true }).click();
		await expect(page.getByRole("status")).toHaveText(
			locale === "fr" ? "Texte enregistré." : "Text saved.",
		);
		await expect(page.getByLabel(title, { exact: true })).toHaveValue(value);
		await page
			.getByRole("link", {
				name: locale === "fr" ? "Mes publications" : "My posts",
				exact: true,
			})
			.click();
		await page
			.getByRole("link", {
				name: locale === "fr" ? "Page suivante" : "Next page",
			})
			.click();
		await page
			.getByRole("link", {
				name: locale === "fr" ? "Page suivante" : "Next page",
			})
			.click();
		await expect(page.getByText(value, { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByText(value, { exact: true })).toBeVisible();
		await page.goto(`/${locale}/post/${id}`);
		await expect(page.getByRole("heading", { name: value })).toBeVisible();
		// FR->EN iteration expects the title from the previous save.
		if (locale === "fr") {
			const row = await own(request, id);
			await call(
				request,
				"savePostText",
				edit(row, "ÉQUIPE Nouvelle 1"),
				0,
				"POST",
			);
		}
	}
	// Existing auth flow cancels queries, clears identity cache and invalidates loaders.
	await page.locator('a[href="/en/private"]').click();
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await page
		.getByLabel("Email address", { exact: true })
		.fill(fixture.actors[1]!.email);
	await page
		.getByLabel("Password", { exact: true })
		.fill(fixture.actors[1]!.password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByTestId("identity")).toHaveText("owner-B");
	await page.locator('a[href="/en/profile"]').click();
	await page.getByRole("link", { name: "My posts", exact: true }).click();
	await expect(page.getByTestId("own-post")).toHaveCount(1);
	await expect(page.getByText("Original 24", { exact: true })).toBeVisible();
	expect(await page.content()).not.toContain("Browser en Équipe");
	await page.goBack();
	await page.goForward();
	await expect(page.getByTestId("own-post")).toHaveCount(1);
	expect(await page.content()).not.toContain("Browser en Équipe");
	await page.goto(`/en/post/${fixture.ids[0]}/edit`);
	await expect(page.getByRole("alert")).toHaveText("Post not found.");
});
