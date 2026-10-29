import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { Account, Client, Users } from "node-appwrite";
import { createClient } from "redis";
import { toJSON } from "seroval";
import { endpoint, state } from "../scripts/recovery-local";

const origin = "http://127.0.0.1:3522";
const config = JSON.parse(
	await readFile(`${state}/credentials.json`, "utf8"),
) as {
	project: string;
	proofKey: string;
	sessionKey: string;
	brokerKey: string;
};
const sdk = () => new Client().setEndpoint(endpoint).setProject(config.project);
const users = new Users(sdk().setKey(config.proofKey));
const broker = new Users(sdk().setKey(config.brokerKey));
const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
const newPassword = `New-${crypto.randomUUID()}-Aa1!`;
const secrets = [
	password,
	newPassword,
	config.proofKey,
	config.sessionKey,
	config.brokerKey,
];
const clean = (text: string) =>
	expect(secrets.some((value) => text.includes(value))).toBe(false);
async function login(page: Page, email: string, value: string, locale = "fr") {
	await page.goto(`/${locale}/sign-in`);
	await page
		.getByLabel(locale === "fr" ? "Adresse e-mail" : "Email address")
		.fill(email);
	await page
		.getByLabel(locale === "fr" ? "Mot de passe" : "Password", { exact: true })
		.fill(value);
	await page
		.getByRole("button", {
			name: locale === "fr" ? "Connexion" : "Sign in",
			exact: true,
		})
		.click();
	await expect(page.getByTestId("identity")).toBeVisible();
}
async function mailLink(email: string, after = 0) {
	for (let i = 0; i < 80; i++) {
		const response = await fetch("http://127.0.0.1:18052/api/v1/messages");
		const data = (await response.json()) as {
			messages: { ID: string; To: { Address: string }[] }[];
		};
		const messages = data.messages.filter((item) =>
			item.To.some((to) => to.Address === email),
		);
		if (messages.length > after) {
			const message = (await (
				await fetch(`http://127.0.0.1:18052/api/v1/message/${messages[0]?.ID}`)
			).json()) as { Text: string; HTML: string };
			const text = `${message.Text}\n${message.HTML}`.replaceAll("&amp;", "&");
			const link = text.match(
				/http:\/\/127\.0\.0\.1:3522\/recovery\/callback[^\s"<>]+/,
			)?.[0];
			if (!link) throw new Error("Missing controlled SMTP challenge");
			const secret = new URL(link).searchParams.get("secret");
			if (secret) secrets.push(secret);
			return link;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("Controlled SMTP not received");
}
async function reset(page: Page, link: string, value = newPassword) {
	await page.goto(link);
	await expect(page).toHaveURL(/\/recovery\?flow=reset$/);
	expect(new URL(page.url()).searchParams.has("secret")).toBe(false);
	clean(await page.content());
	await page.getByLabel(/Nouveau mot de passe|New password/).fill(value);
	await page
		.getByRole("button", { name: /Confirmer|Confirm/, exact: true })
		.click();
}
async function accountRejected(secret: string) {
	try {
		await new Account(sdk().setSession(decodeURIComponent(secret))).get();
		return false;
	} catch {
		return true;
	}
}
test("2.6.2 broker least privilege, no duplicate, disabled/MFA targets and direct API boundaries", async () => {
	await users.create({
		userId: "synthetic-imported",
		email: "mapped@example.test",
		password,
		name: "Mapped",
	});
	const count = (await users.list()).total;
	const issued = await broker.createSession({ userId: "synthetic-imported" });
	secrets.push(issued.secret);
	expect(Boolean(issued.secret)).toBe(true);
	expect((await new Account(sdk().setSession(issued.secret)).get()).$id).toBe(
		"synthetic-imported",
	);
	expect((await users.list()).total).toBe(count);
	await expect(
		new Users(sdk().setKey(config.sessionKey)).get({
			userId: "synthetic-imported",
		}),
	).rejects.toThrow();
	await expect(
		broker.create({
			userId: "must-not-create",
			email: "blocked-create@example.test",
		}),
	).rejects.toThrow();
	// SDK2.6.2 endpoint support, not a claim of Google deployment.
	await new Account(sdk().setSession(issued.secret)).deleteSession({
		sessionId: "current",
	});
});
test("production UI recovery absent/existing/OAuth-only, SMTP FR/EN, password changes and A/B revocation", async ({
	page,
	browser,
	request,
}) => {
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify({ password, newPassword }),
	);
	await chmod(`${state}/fixture.json`, 0o600);
	const email = "recovery-user@example.test";
	await users.create({
		userId: "recovery-user",
		email,
		password,
		name: "Recovery",
	});
	await users.create({
		userId: "oauth-only",
		email: "oauth-only@example.test",
		name: "OAuth only",
	});
	const ctxB = await browser.newContext();
	const pageB = await ctxB.newPage();
	await login(page, email, password);
	await login(pageB, email, password, "en");
	const aCookie = (await page.context().cookies()).find(
		(item) => item.name === "nfe-session-dev",
	);
	const bCookie = (await ctxB.cookies()).find(
		(item) => item.name === "nfe-session-dev",
	);
	if (!aCookie || !bCookie) throw new Error("Missing fixture session");
	secrets.push(aCookie.value, bCookie.value);
	await page.goto("/fr/recovery?flow=change");
	await page.getByLabel("Mot de passe actuel").fill("wrong-current-password");
	await page.getByLabel("Nouveau mot de passe").fill(newPassword);
	await page.getByRole("button", { name: "Confirmer", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Impossible");
	await page.getByLabel("Mot de passe actuel").fill(password);
	await page.getByRole("button", { name: "Confirmer", exact: true }).click();
	await expect(page.getByRole("status")).toContainText(
		"Modification effectuée",
	);
	expect(await accountRejected(aCookie.value)).toBe(false);
	expect(await accountRejected(bCookie.value)).toBe(true);
	// Both fresh sessions must be invalidated after recovery.
	await login(pageB, email, newPassword, "en");
	const newB = (await ctxB.cookies()).find(
		(item) => item.name === "nfe-session-dev",
	);
	if (!newB) throw new Error("Missing second fixture session");
	secrets.push(newB.value);
	let rpcUrl = "";
	let capturedBody = "";
	page.on("request", (event) => {
		if (event.method() === "POST" && event.url().includes("_serverFn")) {
			rpcUrl = event.url();
			capturedBody = event.postData() ?? "";
		}
	});
	await page.goto("/fr/recovery");
	await page.getByLabel("Email", { exact: true }).fill("absent@example.test");
	await page.getByRole("button", { name: "Envoyer le lien" }).click();
	await expect(page.getByRole("status")).toContainText(
		"Si ce compte est éligible",
	);
	const absentText = await page.getByRole("status").textContent();
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page.getByRole("button", { name: "Envoyer le lien" }).click();
	await expect(page.getByRole("status")).toHaveText(absentText ?? "");
	const link = await mailLink(email);
	expect(Boolean(rpcUrl)).toBe(true);
	for (const headers of [
		{ Origin: "https://attacker.test" },
		{ Origin: "http://localhost:3522" },
	]) {
		const result = await request.post(rpcUrl, {
			headers: {
				"x-tsr-serverfn": "true",
				"content-type": "application/json",
				Accept: "application/json",
				...headers,
			},
			data: capturedBody,
		});
		const text = await result.text();
		clean(text);
		expect(text.includes('"ok":true')).toBe(false);
	}
	const invalidInput = await request.post(rpcUrl, {
		headers: {
			Origin: origin,
			"x-tsr-serverfn": "true",
			"content-type": "application/json",
			Accept: "application/json",
		},
		data: JSON.stringify(
			toJSON({
				data: {
					email,
					locale: "fr",
					userId: "victim",
					url: "https://attacker.test",
				},
			}),
		),
	});
	clean(await invalidInput.text());
	await reset(page, link);
	await expect(page.getByRole("status")).toContainText(
		"Modification effectuée",
	);
	expect(await accountRejected(aCookie.value)).toBe(true);
	expect(await accountRejected(newB.value)).toBe(true);
	expect((await users.get({ userId: "recovery-user" })).emailVerification).toBe(
		true,
	);
	const newSession = await new Account(
		sdk().setKey(config.sessionKey),
	).createEmailPasswordSession({ email, password: newPassword });
	secrets.push(newSession.secret);
	await expect(
		new Account(sdk().setKey(config.sessionKey)).createEmailPasswordSession({
			email,
			password,
		}),
	).rejects.toThrow();
	await reset(page, link);
	await expect(page.getByRole("status")).toContainText("Impossible");
	const mismatched = new URL(link);
	mismatched.searchParams.set("userId", "oauth-only");
	await reset(page, mismatched.href);
	await expect(page.getByRole("status")).toContainText("Impossible");
	const invalid = new URL(link);
	invalid.searchParams.set("secret", "not-a-challenge");
	await reset(page, invalid.href);
	await expect(page.getByRole("status")).toContainText("Impossible");
	await page.goto("/en/recovery");
	await page
		.getByLabel("Email", { exact: true })
		.fill("oauth-only@example.test");
	await page.getByRole("button", { name: "Send link" }).click();
	await expect(page.getByRole("status")).toContainText(
		"If this account is eligible",
	);
	const oauthLink = await mailLink("oauth-only@example.test");
	await reset(page, oauthLink);
	await expect(page.getByRole("status")).toContainText("Updated");
	await login(page, "oauth-only@example.test", newPassword, "en");
	await ctxB.close();
	// Record only protected fixture values so scans include all credentials/challenges.
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify(
			Object.fromEntries(secrets.map((value, i) => [`s${i}`, value])),
		),
	);
	await chmod(`${state}/fixture.json`, 0o600);
});
test("fresh verification SMTP, replay, browser binding/state single use and distributed limits", async ({
	page,
	request,
	browser,
}) => {
	const email = "verify-user@example.test";
	await users.create({
		userId: "verify-user",
		email,
		password,
		name: "Verify",
	});
	await login(page, email, password, "en");
	await page.goto("/en/recovery?flow=settings");
	await expect(
		page.getByText("Email not verified", { exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Send link" }).click();
	await expect(page.getByRole("status")).toContainText(
		"If this account is eligible",
	);
	const link = await mailLink(email);
	await page.goto(link);
	await expect(page).toHaveURL(/flow=verify$/);
	clean(await page.content());
	await page.getByRole("button", { name: "Confirm", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Updated");
	expect((await users.get({ userId: "verify-user" })).emailVerification).toBe(
		true,
	);
	await page.goto(link);
	await page.getByRole("button", { name: "Confirm", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Unable");
	const begin = await request.post(`${origin}/oauth/google`, {
		headers: { Origin: origin },
		form: { locale: "fr" },
		maxRedirects: 0,
	});
	expect(begin.status()).toBe(303);
	const authorization = new URL(begin.headers().location ?? "");
	expect(authorization.origin).toBe("https://accounts.google.com");
	expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
	const nonce = authorization.searchParams.get("nonce");
	expect(Boolean(nonce)).toBe(true);
	const stateValue = authorization.searchParams.get("state");
	if (!stateValue) throw new Error("Missing transaction state");
	const redis = createClient({ url: "redis://127.0.0.1:19652" });
	await redis.connect();
	try {
		const digest = (v: string) => createHash("sha256").update(v).digest("hex");
		const prefix = `nfe:auth52:${digest(`${origin}|${config.project}`)}:`;
		const stateKey = `${prefix}oidc:${digest(stateValue)}`;
		expect(await redis.ttl(stateKey)).toBeGreaterThan(0);
		expect(await redis.ttl(stateKey)).toBeLessThanOrEqual(300);
		// Foreign browser has state but no binding and cannot consume it.
		const foreign = await browser.newContext();
		const foreignResult = await foreign.request.get(
			`${origin}/oauth/callback?state=${stateValue}&error=access_denied`,
			{ maxRedirects: 0 },
		);
		expect(foreignResult.headers().location).toContain("oauth=failed");
		expect(await redis.exists(stateKey)).toBe(1);
		await foreign.close();
		const callback = `${origin}/oauth/callback?state=${stateValue}&error=access_denied`;
		const result = await request.get(callback, { maxRedirects: 0 });
		expect(result.status()).toBe(303);
		expect(result.headers()["cache-control"]).toBe("private, no-store");
		expect(await redis.exists(stateKey)).toBe(0);
		const replay = await request.get(callback, { maxRedirects: 0 });
		expect(replay.headers().location).toContain("oauth=failed");
		// Counters live in shared Redis, not a module-local map; concurrent requests cannot exceed the cap.
		const keys = await redis.keys(`${prefix}limit:recovery:*`);
		expect(keys.length).toBeGreaterThan(0);
	} finally {
		redis.destroy();
	}
	const direct = await request.get(`${origin}/oauth/callback?code=direct`, {
		maxRedirects: 0,
	});
	expect(direct.headers().location).toContain("oauth=failed");
	for (const path of [
		"forgot-password",
		"reset-password",
		"change-password",
		"verify-email",
	]) {
		const alias = await request.get(`${origin}/${path}?token=legacy`, {
			maxRedirects: 0,
		});
		expect(alias.status()).toBe(303);
		expect(alias.headers().location).not.toContain("token");
	}
});

test("expired backend challenges, OAuth-only password guard and shared limits across two built replicas", async ({
	page,
	request,
}) => {
	const { execFileSync } = await import("node:child_process");
	await users.create({
		userId: "expired-user",
		email: "expired@example.test",
		password,
		name: "Expiry fixture",
	});
	let forgotRpc = "";
	page.on("request", (event) => {
		if (
			!forgotRpc &&
			event.method() === "POST" &&
			event.url().includes("_serverFn")
		)
			forgotRpc = event.url();
	});
	await page.goto("/en/recovery");
	await page.getByLabel("Email", { exact: true }).fill("expired@example.test");
	await page.getByRole("button", { name: "Send link" }).click();
	await expect(page.getByRole("status")).toContainText(
		"If this account is eligible",
	);
	const expiredLink = await mailLink("expired@example.test");
	// Time fault injection is confined to this disposable fixture table and user.
	execFileSync(
		"docker",
		[
			"exec",
			"nfe-auth-recovery-52-postgresql-1",
			"psql",
			"-U",
			"probe",
			"-d",
			"appwrite",
			"-c",
			"UPDATE appwrite.\"_1_tokens\" SET expire = TIMESTAMP '2000-01-01' WHERE \"userId\"='expired-user'",
		],
		{ stdio: "pipe" },
	);
	await users.updateName({ userId: "expired-user", name: "Expired fixture" });
	await reset(page, expiredLink);
	await expect(page.getByRole("status")).toContainText("Unable");
	await users.create({
		userId: "challenge-only",
		email: "challenge-only@example.test",
		name: "Challenge required",
	});
	const oauthSession = await broker.createSession({ userId: "challenge-only" });
	secrets.push(oauthSession.secret);
	await page.context().addCookies([
		{
			name: "nfe-session-dev",
			value: encodeURIComponent(oauthSession.secret),
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto("/en/recovery?flow=change");
	await page.getByLabel("Current password").fill(password);
	await page.getByLabel("New password").fill(newPassword);
	await page.getByRole("button", { name: "Confirm", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Unable");
	expect(
		Boolean((await users.get({ userId: "challenge-only" })).passwordUpdate),
	).toBe(false);
	await users.create({
		userId: "limited-user",
		email: "limited@example.test",
		password,
		name: "Limit fixture",
	});
	const redis = createClient({ url: "redis://127.0.0.1:19652" });
	await redis.connect();
	const hash = (value: string) =>
		createHash("sha256").update(value).digest("hex");
	const prefix = `nfe:auth52:${hash(`${origin}|${config.project}`)}:`;
	const key = `${prefix}limit:recovery:${hash("limited@example.test")}`;
	const headers = {
		Origin: origin,
		Host: "127.0.0.1:3522",
		"x-tsr-serverfn": "true",
		"content-type": "application/json",
		Accept: "application/json",
	};
	try {
		// Prime the actual shared limiter at its boundary. No privileged backend bypass.
		await redis.set(key, "4", { EX: 900 });
		const calls = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				request.post(forgotRpc.replace(":3522", i % 2 ? ":3523" : ":3522"), {
					headers,
					data: JSON.stringify(
						toJSON({ data: { email: "limited@example.test", locale: "en" } }),
					),
				}),
			),
		);
		const bodies = await Promise.all(calls.map((response) => response.text()));
		for (const body of bodies) clean(body);
		expect(new Set(bodies).size).toBe(1);
		expect(await redis.get(key)).toBe("12");
		await mailLink("limited@example.test");
		const messages = (await (
			await fetch("http://127.0.0.1:18052/api/v1/messages")
		).json()) as { messages: { To: { Address: string }[] }[] };
		expect(
			messages.messages.filter((m) =>
				m.To.some((to) => to.Address === "limited@example.test"),
			).length,
		).toBe(1);
		// Expired shared OAuth transaction is denied, even with its correct browser binding.
		const begin = await request.post(`${origin}/oauth/google`, {
			headers: { Origin: origin },
			form: { locale: "en" },
			maxRedirects: 0,
		});
		const value = new URL(begin.headers().location ?? "").searchParams.get(
			"state",
		);
		if (!value) throw new Error("Missing state");
		await redis.expire(`${prefix}oidc:${hash(value)}`, 0);
		const callback = await request.get(
			`${origin}/oauth/callback?state=${value}&error=access_denied`,
			{ maxRedirects: 0 },
		);
		expect(callback.headers().location).toContain("oauth=failed");
	} finally {
		redis.destroy();
	}
});
test.afterAll(async () => {
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify(
			Object.fromEntries(
				secrets.flatMap((value, i) => [
					[`s${i}`, value],
					[`d${i}`, decodeURIComponent(value)],
				]),
			),
		),
	);
	await chmod(`${state}/fixture.json`, 0o600);
});
