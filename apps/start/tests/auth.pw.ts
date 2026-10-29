import { chmod, readFile, writeFile } from "node:fs/promises";
import {
	type APIResponse,
	expect,
	type Page,
	type Request as PlaywrightRequest,
	test,
} from "@playwright/test";
import { Client, Users } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
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
// Replay the installed Start RPC protocol, not a public REST endpoint. Cookies are
// explicit so the API request context cannot silently supply the wrong identity.
function rpcHeaders(cookie = "", extra: Record<string, string> = {}) {
	return {
		"x-tsr-serverfn": "true",
		"content-type": "application/json",
		Accept: "application/json",
		Origin: origin,
		"sec-fetch-site": "same-origin",
		Cookie: cookie,
		...extra,
	};
}
async function rpcResult(
	response: Pick<APIResponse, "status" | "headers" | "text">,
) {
	expect(response.status()).toBe(200);
	expect(response.headers()["cache-control"]).toBe("private, no-store");
	expect(response.headers().vary?.toLowerCase().split(/,\s*/)).toContain(
		"cookie",
	);
	const text = await response.text();
	noLeaks(text);
	const envelope = fromCrossJSON(JSON.parse(text), {}) as {
		result: unknown;
		error?: unknown;
	};
	expect(envelope.error).toBeUndefined();
	return envelope.result;
}
function rpcBody(data: unknown) {
	return JSON.stringify(toJSON({ data }));
}
async function login(
	page: Page,
	email: string,
	locale = "fr",
	clientNavigation = false,
) {
	if (clientNavigation)
		await page
			.getByRole("link", {
				name: locale === "fr" ? "Connexion" : "Sign in",
				exact: true,
			})
			.click();
	else await page.goto(`/${locale}/sign-in?returnTo=https://evil.test`);
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
	const aCookie = `${cookieA.name}=${cookieA.value}`;
	const readRpc = (call: PlaywrightRequest, cookie = "") =>
		request.get(call.url(), { headers: rpcHeaders(cookie) });
	// Positive private operation establishes that the replay reaches application code.
	expect(await rpcResult(await readRpc(privateCall, aCookie))).toEqual({
		ok: true,
		value: { id: idA, name: "Synthetic A", role: "member" },
	});
	expect(await rpcResult(await readRpc(adminCall))).toEqual({
		ok: false,
		error: "unauthorized",
	});
	expect(await rpcResult(await readRpc(adminCall, aCookie))).toEqual({
		ok: false,
		error: "forbidden",
	});
	await users.updateLabels({ userId: idA, labels: ["admin"] });
	expect(await rpcResult(await readRpc(adminCall, aCookie))).toEqual({
		ok: true,
		value: { id: idA, role: "admin" },
	});
	await users.updateLabels({ userId: idA, labels: [] });
	expect(await rpcResult(await readRpc(adminCall, aCookie))).toEqual({
		ok: false,
		error: "forbidden",
	});
	const mutationRequest = page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
	await page.getByLabel("Nom", { exact: true }).fill("Synthetic A updated");
	await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
	const mutationCall = await mutationRequest;
	await expect(page.getByTestId("name")).toHaveText("Synthetic A updated");
	const mutate = (
		data: unknown,
		cookie = aCookie,
		extra: Record<string, string> = {},
	) =>
		request.post(mutationCall.url(), {
			headers: rpcHeaders(cookie, extra),
			data: rpcBody(data),
		});
	// Valid direct mutation first; only Origin changes for application-policy cases.
	expect(await rpcResult(await mutate({ name: "Direct A" }))).toEqual({
		ok: true,
		value: { updated: true },
	});
	expect((await users.get({ userId: idA })).name).toBe("Direct A");
	await users.updateLabels({ userId: idA, labels: ["admin"] });
	expect(await rpcResult(await mutate({ name: "Direct A" }))).toEqual({
		ok: true,
		value: { updated: true },
	});
	await users.updateLabels({ userId: idA, labels: [] });

	for (const badOrigin of ["https://evil.test", "null", ""]) {
		expect(
			await rpcResult(
				await mutate({ name: "Origin attack" }, aCookie, { Origin: badOrigin }),
			),
		).toEqual({ ok: false, error: "origin" });
		expect((await users.get({ userId: idA })).name).toBe("Direct A");
	}
	// Separately prove Start's Fetch Metadata CSRF rejection (before the app guard).
	const crossSite = await mutate({ name: "CSRF attack" }, aCookie, {
		"sec-fetch-site": "cross-site",
	});
	expect(crossSite.status()).toBe(403);
	expect(await crossSite.text()).toBe("Forbidden");
	expect((await users.get({ userId: idA })).name).toBe("Direct A");
	for (const data of [
		null,
		undefined,
		{},
		[],
		"invalid",
		{ name: 7 },
		{ name: null },
		{ name: " " },
		{ name: "Stolen", userId: userB.$id },
	]) {
		expect(await rpcResult(await mutate(data))).toEqual({
			ok: false,
			error: "invalid",
		});
		expect((await users.get({ userId: idA })).name).toBe("Direct A");
		expect((await users.get({ userId: userB.$id })).name).toBe("Synthetic B");
	}
	expect(await rpcResult(await mutate({ name: "Guest attack" }, ""))).toEqual({
		ok: false,
		error: "unauthorized",
	});
	expect(await rpcResult(await readRpc(privateCall))).toEqual({
		ok: false,
		error: "unauthorized",
	});
	// Disabled identity invalidates reads and mutations without a UI route guard.
	await users.updateStatus({ userId: idA, status: false });
	expect(await rpcResult(await readRpc(privateCall, aCookie))).toEqual({
		ok: false,
		error: "unauthorized",
	});
	expect(await rpcResult(await mutate({ name: "Disabled attack" }))).toEqual({
		ok: false,
		error: "unauthorized",
	});
	expect((await users.get({ userId: idA })).name).toBe("Direct A");
	await users.updateStatus({ userId: idA, status: true });
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
	await page.reload();
	await expect(page.getByTestId("name")).toHaveText("Direct A");
	// Switch directly A -> B, then logout -> A, all in the same browser.
	await page.evaluate(() =>
		Object.assign(window, { accountSwitchWitness: true }),
	);
	await login(page, emailB, "fr", true);
	expect(
		await page.evaluate(() => Reflect.get(window, "accountSwitchWitness")),
	).toBe(true);
	await expect(page.getByTestId("identity")).toHaveText(userB.$id);
	expect(await page.content()).not.toContain(idA);
	expect(await rpcResult(await readRpc(privateCall, aCookie))).toEqual({
		ok: false,
		error: "unauthorized",
	});
	const loggedOutCookie = (await context.cookies()).find(
		(c) => c.name === "nfe-session-dev",
	);
	if (!loggedOutCookie) throw new Error("Missing logout session");
	secrets.push(loggedOutCookie.value);
	const logoutResponse = page.waitForResponse(
		(r) => r.url().includes("/_serverFn/") && r.request().method() === "POST",
	);
	await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
	expect(await rpcResult(await logoutResponse)).toEqual({
		ok: true,
		value: { authenticated: false },
	});
	await expect(page).toHaveURL(/sign-in/);
	expect(
		await rpcResult(
			await readRpc(
				privateCall,
				`${loggedOutCookie.name}=${loggedOutCookie.value}`,
			),
		),
	).toEqual({ ok: false, error: "unauthorized" });
	await expect(page).toHaveURL(/sign-in/);
	expect(
		(await context.cookies()).some(
			(cookie) => cookie.name === "nfe-session-dev",
		),
	).toBe(false);
	await login(page, emailA, "en");
	await expect(page.getByTestId("identity")).toHaveText(idA);
	// Real revocation, independently of natural expiry below.
	await users.deleteSessions({ userId: idA });
	await page.reload();
	await expect(page).toHaveURL(/\/en\/sign-in/);
	expect(
		(await context.cookies()).some(
			(cookie) => cookie.name === "nfe-session-dev",
		),
	).toBe(false);
	// Nonexistent and wrong-password accounts have the same localized message in FR/EN.
	for (const locale of ["fr", "en"]) {
		await page.goto(`/${locale}/sign-in`);
		for (const email of [emailA, `missing-${suffix}@example.test`]) {
			await page
				.getByLabel(locale === "fr" ? "Adresse e-mail" : "Email address")
				.fill(email);
			await page
				.getByLabel(locale === "fr" ? "Mot de passe" : "Password")
				.fill("Wrong-Synthetic-Password");
			const failureResponse = page.waitForResponse(
				(r) =>
					r.url().includes("/_serverFn/") && r.request().method() === "POST",
			);
			await page
				.getByRole("button", {
					name: locale === "fr" ? "Connexion" : "Sign in",
					exact: true,
				})
				.click();
			expect(await rpcResult(await failureResponse)).toEqual({
				ok: false,
				error: "credentials",
			});
			await expect(page.getByRole("alert")).toHaveText(
				locale === "fr"
					? "Impossible de vous authentifier avec ces informations."
					: "Unable to authenticate with these details.",
			);
		}
	}
	expect(
		await rpcResult(
			await readRpc(privateCall, "nfe-session-dev=invalid-session"),
		),
	).toEqual({ ok: false, error: "unauthorized" });
	// Actual project session duration is 60 seconds; never mock the clock or backend.
	await login(page, emailA, "en");
	const expiring = (await context.cookies()).find(
		(c) => c.name === "nfe-session-dev",
	);
	if (!expiring) throw new Error("Missing expiring session");
	secrets.push(expiring.value);
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify({
			password,
			sessionA: cookieA.value,
			sessionB: cookieB.value,
			loggedOutSession: loggedOutCookie.value,
			expiringSession: expiring.value,
		}),
	);
	expect(expiring.expires * 1000 - Date.now()).toBeLessThanOrEqual(61_000);
	expect(
		await rpcResult(
			await readRpc(privateCall, `${expiring.name}=${expiring.value}`),
		),
	).toMatchObject({ ok: true, value: { id: idA } });
	await page.waitForTimeout(
		Math.max(0, expiring.expires * 1000 - Date.now()) + 1500,
	);
	// Replay the expired secret explicitly: the backend, not only browser cookie expiry, must reject it.
	expect(
		await rpcResult(
			await readRpc(privateCall, `${expiring.name}=${expiring.value}`),
		),
	).toEqual({ ok: false, error: "unauthorized" });
	await page.reload();
	await expect(page).toHaveURL(/\/en\/sign-in/);
	expect(
		(await context.cookies()).some((c) => c.name === "nfe-session-dev"),
	).toBe(false);
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
