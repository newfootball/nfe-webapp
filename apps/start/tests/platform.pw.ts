import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3572";
const legacyScript = resolve("dist/client/sw.js");

test("manifest, locale redirects, theme, responsive layout and hydration", async ({
	page,
	request,
	context,
}) => {
	const manifest = await request.get("/manifest.webmanifest");
	expect(manifest.headers()["content-type"]).toContain(
		"application/manifest+json",
	);
	expect(await manifest.json()).toMatchObject({
		id: "/",
		scope: "/",
		start_url: "/",
		display: "standalone",
	});
	for (const size of [192, 512])
		expect((await request.get(`/icons/${size}.png`)).status()).toBe(200);
	const redirect = await request.get("/", {
		headers: { "Accept-Language": "en-GB,fr;q=0.5" },
		maxRedirects: 0,
	});
	expect(redirect.headers().location).toBe("/en");
	expect(redirect.headers()["cache-control"]).toContain("no-store");
	await context.addCookies([{ name: "NEXT_LOCALE", value: "fr", url: origin }]);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (
			message.type() === "error" &&
			/hydrat|did not match|server.render/i.test(message.text())
		)
			errors.push(message.text());
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	await expect(page).toHaveURL(/\/fr$/);
	await expect(page.locator("html")).toHaveClass("dark");
	await page.getByRole("button", { name: "Changer le thème" }).click();
	await expect(page.locator("html")).not.toHaveClass("dark");
	await page.reload();
	await expect(page.locator("html")).not.toHaveClass("dark");
	await page.emulateMedia({ colorScheme: "light" });
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(page.locator("html")).not.toHaveClass("dark");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page
		.getByRole("navigation", { name: "Navigation principale" })
		.getByRole("link", { name: "English", exact: true })
		.click();
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(
		page.getByRole("heading", { name: "Football starts here" }),
	).toBeVisible();
	expect(errors).toEqual([]);
});

test("same-URL legacy upgrade purges cached Next/private data; offline never replays account or signed media", async ({
	page,
	context,
	request,
}) => {
	// Built-runner fixture only: temporarily emulate a previously installed Next
	// worker at its actual URL. No fixture endpoint ships in the application.
	await writeFile(
		legacyScript,
		`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));`,
	);
	try {
		await page.goto("/fr");
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
			if (!navigator.serviceWorker.controller)
				await new Promise<void>((resolve) =>
					navigator.serviceWorker.addEventListener(
						"controllerchange",
						() => resolve(),
						{ once: true },
					),
				);
			const cache = await caches.open("workbox-next-legacy");
			for (const path of [
				"/fr/private",
				"/_next/static/old.js",
				"/_serverFn/session",
				"/notifications",
				"/conversations",
				"/private-media.jpg?X-Amz-Signature=synthetic",
			])
				await cache.put(path, new Response("PRIVATE_LEGACY_SENTINEL"));
		});
	} finally {
		await rm(legacyScript, { force: true });
	}
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => caches.keys()).catch(() => []))
		.toEqual(["nfe-start-public-v1"]);
	await expect
		.poll(() =>
			page.evaluate(
				async () =>
					(await navigator.serviceWorker.getRegistration())?.active?.scriptURL,
			),
		)
		.toBe(`${origin}/sw.js`);
	await page.waitForLoadState("networkidle");
	const sw = await request.get("/sw.js");
	expect(sw.headers()["cache-control"]).toBe("no-store");
	expect(sw.headers()["service-worker-allowed"]).toBe("/");
	await page.evaluate(async () => {
		for (const path of [
			"/fr/private",
			"/notifications",
			"/conversations",
			"/_serverFn/session",
			"/images/default-user.png?X-Amz-Signature=synthetic",
		])
			await fetch(path).catch(() => null);
	});
	const cached = await page.evaluate(async () => {
		const cache = await caches.open("nfe-start-public-v1");
		return (await cache.keys())
			.map((request) => new URL(request.url).pathname)
			.sort();
	});
	expect(cached).toEqual([
		"/icons/192.png",
		"/icons/512.png",
		"/logo.svg",
		"/offline.html",
	]);
	// Represents the browser side of logout: the worker has no session state,
	// and after all cookies are removed no previously requested HTML is replayed.
	await context.clearCookies();
	await context.setOffline(true);
	for (const path of [
		"/fr/private",
		"/en/private",
		"/fr",
		"/notifications",
		"/conversations",
	]) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(503);
		await expect(
			page.getByRole("heading", { name: "Vous êtes hors connexion" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "You are offline" }),
		).toBeVisible();
		expect(await page.content()).not.toContain("PRIVATE_LEGACY_SENTINEL");
	}
	const privateFetch = await page.evaluate(async () => {
		const results = [];
		for (const url of [
			"/_serverFn/session",
			"/images/default-user.png?X-Amz-Signature=synthetic",
			"https://private-b2.invalid/object?X-Amz-Signature=synthetic",
		]) {
			try {
				await fetch(url);
				results.push("unexpected-response");
			} catch {
				results.push("network-error");
			}
		}
		return results;
	});
	expect(privateFetch).toEqual([
		"network-error",
		"network-error",
		"network-error",
	]);
	await context.setOffline(false);
	await page.goto("/en");
	await expect(
		page.getByRole("heading", { name: "Football starts here" }),
	).toBeVisible();
});
