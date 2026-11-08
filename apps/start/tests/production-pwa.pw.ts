import { expect, type Page, test } from "@playwright/test";

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
const labels = {
	fr: {
		email: "Adresse e-mail",
		password: "Mot de passe",
		signIn: "Connexion",
		signOut: "Déconnexion",
	},
	en: {
		email: "Email address",
		password: "Password",
		signIn: "Sign in",
		signOut: "Sign out",
	},
} as const;
const publicCache = [
	"/icons/192.png",
	"/icons/512.png",
	"/logo.svg",
	"/offline.html",
];

async function controlled(page: Page) {
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
	});
}

async function cacheContents(page: Page) {
	return page.evaluate(async () => {
		const names = await caches.keys();
		const entries: { url: string; body: string }[] = [];
		for (const name of names) {
			const cache = await caches.open(name);
			for (const key of await cache.keys())
				entries.push({
					url: key.url,
					body: (await (await cache.match(key))?.text()) ?? "",
				});
		}
		return { names, entries };
	});
}

test("production PWA: private pages never cached, logout then offline shows only the public fallback", async ({
	page,
	context,
	request,
}) => {
	test.skip(!email || !password, "SMOKE_EMAIL/SMOKE_PASSWORD not set: not_run");
	try {
		for (const locale of ["fr", "en"] as const) {
			const l = labels[locale];
			await page.goto(`/${locale}/sign-in`);
			await controlled(page);
			await page.getByLabel(l.email).fill(email as string);
			await page
				.getByLabel(l.password, { exact: true })
				.fill(password as string);
			await page.getByRole("button", { name: l.signIn, exact: true }).click();
			await expect(page).not.toHaveURL(/sign-in/);
			await page.goto(`/${locale}/private`);
			const userId =
				(await page.getByTestId("identity").textContent())?.trim() ?? "";
			expect(userId.length).toBeGreaterThan(0);
			const cookie = (await context.cookies()).find(
				(c) => c.name === "__Host-nfe-session",
			);
			if (!cookie) throw new Error("login_without_session_cookie");

			for (const path of [
				"private",
				"feed",
				"notifications",
				"messages",
				"profile",
			]) {
				const online = await page.goto(`/${locale}/${path}`);
				expect(online?.headers()["cache-control"]).toContain("no-store");
			}

			await context.setOffline(true);
			const offlineSignedIn = await page.goto(`/${locale}/private`);
			expect(offlineSignedIn?.status()).toBe(503);
			expect(await page.content()).not.toContain(userId);
			await context.setOffline(false);

			await page.goto(`/${locale}/private`);
			await page.getByRole("button", { name: l.signOut, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
			expect(
				(await context.cookies()).some((c) => c.name === cookie.name),
			).toBe(false);

			const replay = await request.get(`/${locale}/private`, {
				maxRedirects: 0,
				headers: { Cookie: `${cookie.name}=${cookie.value}` },
			});
			expect(replay.status()).toBeGreaterThanOrEqual(300);
			expect(replay.status()).toBeLessThan(400);
			expect(replay.headers().location).toContain(`/${locale}/sign-in`);

			await context.setOffline(true);
			for (const path of [
				"private",
				"feed",
				"notifications",
				"messages",
				"profile",
			]) {
				const offline = await page.goto(`/${locale}/${path}`);
				expect(offline?.status()).toBe(503);
				await expect(
					page.getByRole("heading", { name: "You are offline" }),
				).toBeVisible();
				expect(await page.content()).not.toContain(userId);
			}
			const cached = await cacheContents(page);
			expect(cached.names).toEqual(["nfe-start-public-v1"]);
			expect(cached.entries.map((e) => new URL(e.url).pathname).sort()).toEqual(
				publicCache,
			);
			for (const entry of cached.entries) {
				expect(entry.body).not.toContain(userId);
				expect(entry.body.includes(cookie.value)).toBe(false);
			}
			await context.setOffline(false);
			await page.goto(`/${locale}/private`);
			await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
		}
	} finally {
		await context.setOffline(false);
	}
});
