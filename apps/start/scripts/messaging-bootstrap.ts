import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { endpoint, state } from "./messaging-local";

export async function bootstrap() {
	if (
		process.env.NFE_MESSAGING_SYNTHETIC !== "1" ||
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
			messagingWriterKey: string;
			sessionKey: string;
			writerKey: string;
			readerKey: string;
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
		userId: "messaging-console",
		email: "messaging-console@example.test",
		password,
		name: "Synthetic console",
	});
	await consoleRequest("/account/sessions/email", {
		email: "messaging-console@example.test",
		password,
	});
	const team = await consoleRequest("/teams", {
		teamId: "messaging-team",
		name: "Auth synthetic",
	});
	await consoleRequest("/projects", {
		projectId: "nfe-messaging",
		name: "Auth synthetic",
		teamId: team.$id,
	});
	await consoleRequest(
		"/projects/nfe-messaging/auth/duration",
		{ duration: 3600 },
		"PATCH",
	);
	const proofKey = await consoleRequest("/projects/nfe-messaging/keys", {
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
	const sessionKey = await consoleRequest("/projects/nfe-messaging/keys", {
		keyId: "session-key",
		name: "SSR session creation only",
		scopes: ["sessions.write"],
	});
	const readerKey = await consoleRequest("/projects/nfe-messaging/keys", {
		keyId: "messaging-reader",
		name: "Bounded verified public child reads",
		scopes: ["rows.read"],
	});
	const writerKey = await consoleRequest("/projects/nfe-messaging/keys", {
		keyId: "profile-writer",
		name: "Profile row mutations only",
		scopes: ["rows.write"],
	});
	const messagingWriterKey = await consoleRequest(
		"/projects/nfe-messaging/keys",
		{
			keyId: "messaging-writer",
			name: "Validated private messaging mutations",
			scopes: ["rows.read", "rows.write"],
		},
	);
	const config = {
		project: "nfe-messaging",
		messagingWriterKey: messagingWriterKey.secret,
		proofKey: proofKey.secret,
		sessionKey: sessionKey.secret,
		writerKey: writerKey.secret,
		readerKey: readerKey.secret,
	};
	await Bun.write(`${state}/credentials.json`, JSON.stringify(config));
	await chmod(`${state}/credentials.json`, 0o600);
	return config;
}
