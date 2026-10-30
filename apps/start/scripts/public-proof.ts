import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { Client, Permission, Role, TablesDB } from "node-appwrite";
import { bootstrap } from "./public-bootstrap";
import { endpoint, state } from "./public-local";

const c = await bootstrap();
const admin = new TablesDB(
	new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
);
const databaseId = "public-proof";
const dir = resolve(import.meta.dir, "../../../tools/appwrite-schema");
const { provision } = await import(`${dir}/provision.mts`);
const { provisionProfileV2 } = await import(`${dir}/profile-v2.mts`);
if (!(await Bun.file(`${state}/fixtures-ready`).exists()))
	await provision(admin, databaseId);
await provisionProfileV2(admin, databaseId);
const stamp = "2026-01-15T12:34:56.123Z";
if (!(await Bun.file(`${state}/fixtures-ready`).exists())) {
	for (let i = 0; i < 26; i++) {
		const name = `Public Player ${String(i).padStart(2, "0")}`;
		await admin.createRow({
			databaseId,
			tableId: "profiles",
			rowId: `player-${String(i).padStart(2, "0")}`,
			permissions: [Permission.read(Role.any())],
			data: {
				name,
				nameFolded: name.toLowerCase(),
				image: null,
				biography: "Synthetic public biography",
				position: ["GOALKEEPER"],
				foot: [],
				localisation: i % 2 ? "Paris" : "PARIS",
				userType: "PLAYER",
				isOnboarded: i !== 25,
				createdAt: stamp,
				updatedAt: stamp,
			},
		});
	}
	await admin.createRow({
		databaseId,
		tableId: "profiles",
		rowId: "hidden-player",
		permissions: [],
		data: {
			name: "HIDDEN-PROFILE",
			nameFolded: "hidden-profile",
			position: [],
			foot: [],
			userType: "PLAYER",
			isOnboarded: true,
			createdAt: stamp,
			updatedAt: stamp,
		},
	});
	for (const status of ["PUBLISHED", "DRAFT", "ARCHIVED"]) {
		await admin.createRow({
			databaseId,
			tableId: "posts",
			rowId: `post-${status}`,
			permissions: status === "PUBLISHED" ? [Permission.read(Role.any())] : [],
			data: {
				userId: "player-00",
				slug: `slug-${status}`,
				title: `Synthetic ${status}`,
				description: "Synthetic post description",
				titleFolded: `synthetic ${status.toLowerCase()}`,
				descriptionFolded: "synthetic post description",
				status,
				type: "video",
				createdAt: stamp,
				updatedAt: stamp,
				publishedAt: stamp,
			},
		});
	}
	await Bun.write(`${state}/fixtures-ready`, "1");
}
const log = `${state}/server.log`;
await Bun.write(log, "");
await chmod(log, 0o600);
const base = "http://127.0.0.1:3561";
const server = Bun.spawn(["bun", "server.ts"], {
	cwd: resolve(import.meta.dir, ".."),
	stdout: Bun.file(log),
	stderr: Bun.file(log),
	env: {
		...process.env,
		START_APP_ORIGIN: base,
		START_APPWRITE_ENDPOINT: endpoint,
		START_APPWRITE_PROJECT: c.project,
		START_APPWRITE_DATABASE: databaseId,
		START_APPWRITE_SESSION_KEY: c.sessionKey,
		START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
		START_APPWRITE_FEED_READER_KEY: c.readerKey,
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		PORT: "3561",
		NODE_ENV: "production",
	},
});
const measurements: {
	path: string;
	status: number;
	ms: number;
	bytes: number;
}[] = [];
async function get(path: string, locale = "fr", status = 200) {
	const start = performance.now();
	const response = await fetch(base + path, {
		headers: { "Accept-Language": locale },
		redirect: "manual",
	});
	const html = await response.text();
	measurements.push({
		path,
		status: response.status,
		ms: performance.now() - start,
		bytes: Buffer.byteLength(html),
	});
	assert.equal(response.status, status, `HTTP ${path}: ${html.slice(0, 200)}`);
	return { response, html };
}
try {
	for (let i = 0; i < 60; i++) {
		try {
			await fetch(base + "/robots.txt");
			break;
		} catch {
			await Bun.sleep(250);
		}
	}
	for (const locale of ["fr", "en"]) {
		for (const path of [
			"/about-us",
			"/contact",
			"/privacy",
			"/terms",
			"/splash",
		]) {
			const { html, response } = await get(path, locale);
			assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
			assert.match(html, /<h1[ >]/);
			assert.ok(html.includes(`rel="canonical" href="${base}${path}"`));
			assert.ok(html.includes('property="og:title"'));
			assert.ok(response.headers.get("cache-control")?.includes("no-store"));
		}
	}
	for (const path of [
		"/players",
		"/coaches",
		"/recruiters",
		"/clubs",
		"/players/goalkeeper",
		"/players/city/paris",
	]) {
		const { html } = await get(path);
		if (path.includes("players")) assert.match(html, /Public Player/);
		assert.ok(!html.includes("HIDDEN-PROFILE"));
		assert.ok(!html.includes("Public Player 25"));
	}
	const first = await get("/players"),
		second = await get("/players?page=2");
	assert.ok(first.html.includes("?page=2"));
	assert.ok(second.html.includes("?page=1"));
	assert.match(second.html, /Public Player 00/);
	for (const path of [
		"/players/no-position",
		"/players/city/no-city",
		"/no-type",
		"/players?page=3",
		"/es",
		"/fr/missing",
		"/fr/post/post-DRAFT",
		"/fr/post/post-ARCHIVED",
	])
		await get(path, "fr", 404);
	const post = await get("/fr/post/post-PUBLISHED");
	assert.match(post.html, /Synthetic PUBLISHED/);
	assert.match(
		post.html,
		/name="description" content="Synthetic post description"/,
	);
	const profile = await get("/en/user/player-00");
	assert.match(profile.html, /Synthetic public biography/);
	const sitemap = await get("/sitemap.xml");
	assert.ok(sitemap.html.includes("/post/post-PUBLISHED"));
	assert.ok(!sitemap.html.includes("post-DRAFT"));
	assert.ok(!sitemap.html.includes("post-ARCHIVED"));
	assert.ok(!sitemap.html.includes("hidden-player"));
	assert.ok(!sitemap.html.includes("player-25"));
	// Synthetic revocation verifies fresh sitemap reads, not #56's mutation workflow.
	await admin.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "post-PUBLISHED",
		data: { status: "ARCHIVED" },
		permissions: [],
	});
	assert.ok(!(await get("/sitemap.xml")).html.includes("post-PUBLISHED"));
	await get("/fr/post/post-PUBLISHED", "fr", 404);
	await admin.updateRow({
		databaseId,
		tableId: "posts",
		rowId: "post-PUBLISHED",
		data: { status: "PUBLISHED" },
		permissions: [Permission.read(Role.any())],
	});

	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL,
	});
	try {
		for (const locale of ["fr", "en"]) {
			const context = await browser.newContext({
				javaScriptEnabled: false,
				locale: locale === "fr" ? "fr-FR" : "en-GB",
			});
			const page = await context.newPage();
			await page.goto(base + "/players");
			await page
				.getByRole("link", {
					name: locale === "fr" ? "Page suivante" : "Next page",
				})
				.click();
			assert.ok(page.url().endsWith("?page=2"));
			assert.ok(
				(await page.locator("body").innerText()).includes("Public Player 00"),
			);
			await page.locator('a[href="/user/player-00"]').click();
			assert.ok(page.url().endsWith(`/${locale}/user/player-00`));
			assert.ok(
				(await page.locator("body").innerText()).includes(
					"Synthetic public biography",
				),
			);
			await page.goto(base + "/post/post-PUBLISHED");
			assert.ok(page.url().endsWith(`/${locale}/post/post-PUBLISHED`));
			assert.ok(
				(await page.locator("body").innerText()).includes(
					"Synthetic PUBLISHED",
				),
			);
			await context.close();
		}
	} finally {
		await browser.close();
	}
	await Bun.write(
		`${state}/proof.json`,
		JSON.stringify(
			{
				kind: "isolated-synthetic-public-pages",
				measurements,
				scope:
					"HTTP SSR FR/EN/static/directory pagination/keyless visibility/sitemap revocation; no real import/56 mutation or production budget acceptance",
			},
			null,
			2,
		),
	);
	process.stdout.write(
		`Public HTTP proof passed: ${measurements.length} requests.\n`,
	);
} finally {
	server.kill();
	await server.exited;
}
