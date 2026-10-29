import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { endpoint, state } from "./profile-local";

export async function bootstrap() {
	if (
		process.env.NFE_PROFILE_SYNTHETIC !== "1" ||
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
			writerKey: string;
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
		userId: "profile-console",
		email: "profile-console@example.test",
		password,
		name: "Synthetic console",
	});
	await consoleRequest("/account/sessions/email", {
		email: "profile-console@example.test",
		password,
	});
	const team = await consoleRequest("/teams", {
		teamId: "profile-team",
		name: "Auth synthetic",
	});
	await consoleRequest("/projects", {
		projectId: "nfe-profile",
		name: "Auth synthetic",
		teamId: team.$id,
	});
	await consoleRequest(
		"/projects/nfe-profile/auth/duration",
		{ duration: 3600 },
		"PATCH",
	);
	const proofKey = await consoleRequest("/projects/nfe-profile/keys", {
		keyId: "proof-key",
		name: "Synthetic fixture management",
		scopes: [
			"users.read",
			"users.write",
			"databases.read",
			"databases.write",
			"tables.read",
			"tables.write",
			"columns.read",
			"columns.write",
			"indexes.read",
			"indexes.write",
			"rows.read",
			"rows.write",
		],
	});
	const sessionKey = await consoleRequest("/projects/nfe-profile/keys", {
		keyId: "session-key",
		name: "SSR session creation only",
		scopes: ["sessions.write"],
	});
	const writerKey = await consoleRequest("/projects/nfe-profile/keys", {
		keyId: "profile-writer",
		name: "Profile row mutations only",
		scopes: ["rows.write"],
	});
	const config = {
		project: "nfe-profile",
		proofKey: proofKey.secret,
		sessionKey: sessionKey.secret,
		writerKey: writerKey.secret,
	};
	await Bun.write(`${state}/credentials.json`, JSON.stringify(config));
	await chmod(`${state}/credentials.json`, 0o600);
	return config;
}
