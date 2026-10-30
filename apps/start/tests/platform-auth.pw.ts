import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { Client, Users } from "node-appwrite";
import { endpoint, state } from "../scripts/auth-local";

const config = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const users = new Users(
	new Client()
		.setEndpoint(endpoint)
		.setProject(config.project)
		.setKey(config.proofKey),
);

test("real Appwrite logout revokes session before FR/EN offline negative checks", async ({
	page,
	context,
	request,
}) => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const userId = `platform-${suffix}`;
	const name = `NFE_PWA_PRIVATE_${suffix}`;
	const email = `${userId}@example.test`;
	const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
	await users.create({ userId, email, password, name });
	try {
		for (const locale of ["fr", "en"] as const) {
			const labels =
				locale === "fr"
					? {
							email: "Adresse e-mail",
							password: "Mot de passe",
							signIn: "Connexion",
							signOut: "Déconnexion",
						}
					: {
							email: "Email address",
							password: "Password",
							signIn: "Sign in",
							signOut: "Sign out",
						};
			await page.goto(`/${locale}/sign-in`);
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
			await page.getByLabel(labels.email).fill(email);
			await page
				.getByLabel(labels.password, {
					exact: true,
				})
				.fill(password);
			await page
				.getByRole("button", {
					name: labels.signIn,
					exact: true,
				})
				.click();
			await expect(page.getByTestId("identity")).toHaveText(userId);
			await expect(page.getByTestId("name")).toHaveText(name);
			const cookie = (await context.cookies()).find(
				(value) => value.name === "nfe-session-dev",
			);
			if (!cookie) throw new Error("Synthetic login did not set a session");
			const response = await context.request.get(`/${locale}/private`);
			expect(response.headers()["cache-control"]).toContain("no-store");
			expect(await response.text()).toContain(name);
			// Even while still signed in, a fresh offline document cannot show the
			// identity which was just read successfully online.
			await context.setOffline(true);
			const offlineSignedIn = await page.goto(`/${locale}/private`);
			expect(offlineSignedIn?.status()).toBe(503);
			expect(await page.content()).not.toContain(name);
			await context.setOffline(false);
			await page.goto(`/${locale}/private`);
			await expect(page.getByTestId("identity")).toHaveText(userId);
			const logoutRequest = page.waitForRequest(
				(value) =>
					value.url().includes("/_serverFn/") && value.method() === "POST",
			);
			await page
				.getByRole("button", {
					name: labels.signOut,
					exact: true,
				})
				.click();
			const logoutRpc = await logoutRequest;
			await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
			expect(
				(await context.cookies()).some((value) => value.name === cookie.name),
			).toBe(false);
			expect((await users.listSessions({ userId })).total).toBe(0);
			// Replaying the former browser cookie cannot restore a revoked session.
			const revoked = await request.get(`/${locale}/private`, {
				maxRedirects: 0,
				headers: { Cookie: `${cookie.name}=${cookie.value}` },
			});
			expect(revoked.status()).toBeGreaterThanOrEqual(300);
			expect(revoked.status()).toBeLessThan(400);
			expect(revoked.headers().location).toContain(`/${locale}/sign-in`);
			expect(await revoked.text()).not.toContain(name);
			await context.setOffline(true);
			for (const path of [
				`/${locale}/private`,
				`/${locale}/profile`,
				"/notifications",
				"/conversations",
			]) {
				const response = await page.goto(path);
				expect(response?.status()).toBe(503);
				await expect(
					page.getByRole("heading", { name: "You are offline" }),
				).toBeVisible();
				expect(await page.content()).not.toContain(name);
				expect(await page.content()).not.toContain(userId);
			}
			expect(
				await page.evaluate(async (url) => {
					try {
						await fetch(url, { method: "POST", body: "{}" });
						return false;
					} catch {
						return true;
					}
				}, logoutRpc.url()),
			).toBe(true);
			const cached = await page.evaluate(async () => {
				const names = await caches.keys();
				const entries = [];
				for (const name of names) {
					const cache = await caches.open(name);
					for (const key of await cache.keys()) {
						const response = await cache.match(key);
						entries.push({ url: key.url, body: await response?.text() });
					}
				}
				return { names, entries };
			});
			expect(cached.names).toEqual(["nfe-start-public-v1"]);
			expect(
				cached.entries.map((entry) => new URL(entry.url).pathname).sort(),
			).toEqual([
				"/icons/192.png",
				"/icons/512.png",
				"/logo.svg",
				"/offline.html",
			]);
			for (const entry of cached.entries) {
				expect(entry.body).not.toContain(name);
				expect(entry.body?.includes(cookie.value)).toBe(false);
			}
			await context.setOffline(false);
			await page.goto(`/${locale}/private`);
			await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
		}
	} finally {
		await context.setOffline(false);
		await users.delete({ userId });
	}
});
