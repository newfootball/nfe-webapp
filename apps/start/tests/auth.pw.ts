import { chmod, readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { Client, Users } from "node-appwrite";
import { endpoint, state } from "../scripts/auth-local";

const origin = "http://127.0.0.1:3511";
const config = JSON.parse(
	await readFile(`${state}/credentials.json`, "utf8"),
) as {
	project: string;
	proofKey: string;
	sessionKey: string;
};
const users = new Users(
	new Client()
		.setEndpoint(endpoint)
		.setProject(config.project)
		.setKey(config.proofKey),
);
const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
const suffix = crypto.randomUUID().slice(0, 8);
const emailA = `a-${suffix}@example.test`;
const emailB = `b-${suffix}@example.test`;
const secrets: string[] = [password, config.proofKey, config.sessionKey];
function noLeaks(text: string) {
	expect(secrets.some((secret) => text.includes(secret))).toBe(false);
}
async function login(page: Page, email: string, locale = "fr") {
	await page.goto(`/${locale}/sign-in`);
	await page
		.getByLabel(locale === "fr" ? "Adresse e-mail" : "Email address")
		.fill(email);
	await page
		.getByLabel(locale === "fr" ? "Mot de passe" : "Password")
		.fill(password);
	await page
		.getByRole("button", {
			name: locale === "fr" ? "Connexion" : "Sign in",
			exact: true,
		})
		.click();
	await expect(page.getByTestId("identity")).toBeVisible();
}

test("real SSR auth, A/B isolation, direct function guards, revocation and no leaks", async ({
	page,
	context,
	request,
	browser,
}) => {
	const consoleMessages: string[] = [];
	page.on("console", (message) => consoleMessages.push(message.text()));
	const browserBodies: string[] = [];
	page.on("response", async (response) => {
		if (
			response.url().startsWith(origin) &&
			/json|html|javascript/.test(response.headers()["content-type"] ?? "")
		) {
			try {
				browserBodies.push(await response.text());
			} catch {}
		}
	});
	await writeFile(`${state}/fixture.json`, JSON.stringify({ password }));
	await chmod(`${state}/fixture.json`, 0o600);
	const userB = await users.create({
		userId: `b${suffix}`,
		email: emailB,
		password,
		name: "Synthetic B",
	});
	// A is signed up through the actual browser UI.
	await page.goto("/fr/private");
	await expect(page).toHaveURL(/\/fr\/sign-in/);
	await page.getByRole("button", { name: "Inscription", exact: true }).click();
	await page.getByLabel("Nom", { exact: true }).fill("Synthetic A");
	await page.getByLabel("Adresse e-mail").fill(emailA);
	await page.getByLabel("Mot de passe").fill(password);
	await page.getByRole("button", { name: "Inscription", exact: true }).click();
	await expect(page.getByTestId("name")).toHaveText("Synthetic A");
	const idA = await page.getByTestId("identity").innerText();
	const cookieA = (await context.cookies()).find(
		(cookie) => cookie.name === "nfe-session-dev",
	);
	expect(
		Boolean(
			cookieA?.httpOnly &&
				cookieA.sameSite === "Lax" &&
				cookieA.path === "/" &&
				!cookieA.secure &&
				cookieA.expires > Date.now() / 1000,
		),
	).toBe(true);
	if (!cookieA) throw new Error("No session cookie");
	secrets.push(cookieA.value);
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify({ password, sessionA: cookieA.value }),
	);
	await page.reload();
	await expect(page.getByTestId("name")).toHaveText("Synthetic A");
	// Client navigation keeps the JS document alive and server checks still execute.
	await page.evaluate(() => {
		Object.assign(window, { authNavigationWitness: true });
	});
	await page.getByRole("link", { name: "Accueil", exact: true }).click();
	const privateRequest = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "GET",
	);
	await page.getByRole("link", { name: "Mon espace", exact: true }).click();
	const privateCall = await privateRequest;
	await expect(page.getByTestId("name")).toHaveText("Synthetic A");
	expect(
		await page.evaluate(() => Reflect.get(window, "authNavigationWitness")),
	).toBe(true);
	const adminRequest = page.waitForRequest((r) =>
		r.url().includes("/_serverFn/"),
	);
	await page.getByRole("button", { name: "Vérifier les droits admin" }).click();
	const adminCall = await adminRequest;
	await expect(page.getByRole("status")).toHaveText("Accès refusé.");
	// Prefs cannot grant admin. Protected labels can, and removal applies without re-login.
	await users.updatePrefs({
		userId: idA,
		prefs: { role: "admin", labels: ["admin"] },
	});
	let direct = await request.get(adminCall.url());
	expect(await direct.text()).toContain("unauthorized");
	direct = await request.get(adminCall.url(), {
		headers: { Cookie: `${cookieA.name}=${cookieA.value}` },
	});
	expect(await direct.text()).toContain("forbidden");
	await users.updateLabels({ userId: idA, labels: ["admin"] });
	direct = await request.get(adminCall.url(), {
		headers: { Cookie: `${cookieA.name}=${cookieA.value}` },
	});
	expect(await direct.text()).toContain("admin");
	await users.updateLabels({ userId: idA, labels: [] });
	direct = await request.get(adminCall.url(), {
		headers: { Cookie: `${cookieA.name}=${cookieA.value}` },
	});
	expect(await direct.text()).toContain("forbidden");
	const mutationRequest = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await page.getByLabel("Nom", { exact: true }).fill("Synthetic A updated");
	await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
	const mutationCall = await mutationRequest;
	await expect(page.getByTestId("name")).toHaveText("Synthetic A updated");
	const contentType =
		mutationCall.headers()["content-type"] ?? "application/json";
	for (const badOrigin of ["https://evil.test", "null", ""]) {
		const response = await request.post(mutationCall.url(), {
			headers: {
				"content-type": contentType,
				Origin: badOrigin,
				Cookie: `${cookieA.name}=${cookieA.value}`,
			},
			data: mutationCall.postData(),
		});
		const body = await response.text();
		expect(response.status() >= 400 || body.includes("origin")).toBe(true);
		noLeaks(body);
	}
	const noIdentity = await request.post(mutationCall.url(), {
		headers: { "content-type": contentType, Origin: origin },
		data: mutationCall.postData(),
	});
	expect(await noIdentity.text()).toContain("unauthorized");
	const privateGuest = await request.get(privateCall.url());
	expect(await privateGuest.text()).toContain("unauthorized");
	// B in another context gives concurrent SSR isolation for identical route/query keys.
	const other = await browser.newContext();
	const pageB = await other.newPage();
	await login(pageB, emailB, "en");
	const cookieB = (await other.cookies()).find(
		(cookie) => cookie.name === "nfe-session-dev",
	);
	if (!cookieB) throw new Error("No B session");
	secrets.push(cookieB.value);
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify({
			password,
			sessionA: cookieA.value,
			sessionB: cookieB.value,
		}),
	);
	const responses = await Promise.all(
		Array.from({ length: 10 }, (_, i) =>
			request
				.get(i % 2 ? "/en/private" : "/fr/private", {
					headers: {
						Cookie: `nfe-session-dev=${i % 2 ? cookieB.value : cookieA.value}`,
					},
				})
				.then(async (response) => ({
					response,
					body: await response.text(),
					i,
				})),
		),
	);
	for (const { response, body, i } of responses) {
		expect(response.status()).toBe(200);
		expect(response.headers()["cache-control"]).toContain("no-store");
		expect(body).toContain(i % 2 ? userB.$id : idA);
		expect(body).not.toContain(i % 2 ? idA : userB.$id);
		noLeaks(body);
	}
	await other.close();
	// Switch directly A -> B, then logout -> A, all in the same browser.
	await login(page, emailB);
	await expect(page.getByTestId("identity")).toHaveText(userB.$id);
	expect(await page.content()).not.toContain(idA);
	const revokedA = await request.get(privateCall.url(), {
		headers: { Cookie: `${cookieA.name}=${cookieA.value}` },
	});
	expect(await revokedA.text()).toContain("unauthorized");
	await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
	await expect(page).toHaveURL(/sign-in/);
	expect(
		(await context.cookies()).some(
			(cookie) => cookie.name === "nfe-session-dev",
		),
	).toBe(false);
	await login(page, emailA, "en");
	await expect(page.getByTestId("identity")).toHaveText(idA);
	// Real server revocation is the same fail-closed boundary as an expired session.
	await users.deleteSessions({ userId: idA });
	await page.reload();
	await expect(page).toHaveURL(/\/en\/sign-in/);
	expect(
		(await context.cookies()).some(
			(cookie) => cookie.name === "nfe-session-dev",
		),
	).toBe(false);
	// Nonexistent and wrong-password accounts have exactly the same localized message.
	for (const email of [emailA, `missing-${suffix}@example.test`]) {
		await page.getByLabel("Email address").fill(email);
		await page.getByLabel("Password").fill("Wrong-Synthetic-Password");
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await expect(page.getByRole("alert")).toHaveText(
			"Unable to authenticate with these details.",
		);
	}
	const invalid = await request.get(privateCall.url(), {
		headers: { Cookie: "nfe-session-dev=invalid-session" },
	});
	expect(await invalid.text()).toContain("unauthorized");
	// Session key cannot administer users or read private data.
	let blocked = false;
	try {
		await new Users(
			new Client()
				.setEndpoint(endpoint)
				.setProject(config.project)
				.setKey(config.sessionKey),
		).list();
	} catch {
		blocked = true;
	}
	expect(blocked).toBe(true);
	for (const body of [...browserBodies, ...consoleMessages]) noLeaks(body);
});
