import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { endpoint, state } from "./auth-local";

export async function bootstrap() {
	if (
		process.env.NFE_AUTH_SYNTHETIC !== "1" ||
		!(await Bun.file(`${state}/compose.json`).exists())
	)
		throw new Error("Dedicated synthetic opt-in required");
	const health = await fetch(`${endpoint}/health/version`);
	assert.equal(((await health.json()) as { version: string }).version, "2.6.2");
	const saved = Bun.file(`${state}/credentials.json`);
	if (await saved.exists())
		return (await saved.json()) as {
			project: string;
			proofKey: string;
			sessionKey: string;
		};
	let cookie = "";
	async function consoleRequest(
		path: string,
		body?: object,
		method = body ? "POST" : "GET",
	) {
		const response = await fetch(`${endpoint}${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				"X-Appwrite-Project": "console",
				Origin: "http://localhost",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = (await response.json()) as { $id: string; secret: string };
		if (!response.ok)
			throw new Error(`Synthetic bootstrap HTTP ${response.status} at ${path}`);
		const cookies = response.headers.getSetCookie();
		if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
		return data;
	}
	const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
	await consoleRequest("/account", {
		userId: "auth-console",
		email: "auth-console@example.test",
		password,
		name: "Synthetic console",
	});
	await consoleRequest("/account/sessions/email", {
		email: "auth-console@example.test",
		password,
	});
	const team = await consoleRequest("/teams", {
		teamId: "auth-team",
		name: "Auth synthetic",
	});
	await consoleRequest("/projects", {
		projectId: "nfe-auth",
		name: "Auth synthetic",
		teamId: team.$id,
	});
	await consoleRequest(
		"/projects/nfe-auth/auth/duration",
		{ duration: 60 },
		"PATCH",
	);
	const proofKey = await consoleRequest("/projects/nfe-auth/keys", {
		keyId: "proof-key",
		name: "Synthetic fixture management",
		scopes: ["users.read", "users.write"],
	});
	const sessionKey = await consoleRequest("/projects/nfe-auth/keys", {
		keyId: "session-key",
		name: "SSR session creation only",
		scopes: ["sessions.write"],
	});
	const config = {
		project: "nfe-auth",
		proofKey: proofKey.secret,
		sessionKey: sessionKey.secret,
	};
	await Bun.write(`${state}/credentials.json`, JSON.stringify(config));
	await chmod(`${state}/credentials.json`, 0o600);
	return config;
}
