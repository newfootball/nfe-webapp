import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { endpoint, state } from "./post-lifecycle-local";

export async function bootstrap() {
	if (
		process.env.NFE_LIFECYCLE_SYNTHETIC !== "1" ||
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
			mediaWriterKey: string;
			mediaReaderKey: string;
			lifecycleWriterKey: string;
			postWriterKey: string;
			interactionWriterKey: string;
			notificationWriterKey: string;
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
		userId: "lifecycle-console",
		email: "lifecycle-console@example.test",
		password,
		name: "Synthetic console",
	});
	await consoleRequest("/account/sessions/email", {
		email: "lifecycle-console@example.test",
		password,
	});
	const team = await consoleRequest("/teams", {
		teamId: "lifecycle-team",
		name: "Auth synthetic",
	});
	await consoleRequest("/projects", {
		projectId: "nfe-lifecycle-56",
		name: "Auth synthetic",
		teamId: team.$id,
	});
	await consoleRequest(
		"/projects/nfe-lifecycle-56/auth/duration",
		{ duration: 3600 },
		"PATCH",
	);
	const proofKey = await consoleRequest("/projects/nfe-lifecycle-56/keys", {
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
	const sessionKey = await consoleRequest("/projects/nfe-lifecycle-56/keys", {
		keyId: "session-key",
		name: "SSR session creation only",
		scopes: ["sessions.write"],
	});
	const readerKey = await consoleRequest("/projects/nfe-lifecycle-56/keys", {
		keyId: "feed-reader",
		name: "Bounded verified public child reads",
		scopes: ["rows.read"],
	});
	const writerKey = await consoleRequest("/projects/nfe-lifecycle-56/keys", {
		keyId: "profile-writer",
		name: "Profile row mutations only",
		scopes: ["rows.write"],
	});
	const mediaWriter = await consoleRequest("/projects/nfe-lifecycle-56/keys", {
		keyId: "media-writer",
		name: "Media row transactions only",
		scopes: ["rows.read", "rows.write"],
	});
	const mediaReader = await consoleRequest("/projects/nfe-lifecycle-56/keys", {
		keyId: "media-reader",
		name: "Authorized media reads only",
		scopes: ["rows.read"],
	});
	const keyFor = async (keyId: string) =>
		(
			await consoleRequest("/projects/nfe-lifecycle-56/keys", {
				keyId,
				name: keyId,
				scopes: ["rows.read", "rows.write"],
			})
		).secret;
	const lifecycleWriterKey = await keyFor("lifecycle-writer");
	const postWriterKey = await keyFor("post-text-writer");
	const interactionWriterKey = await keyFor("interaction-writer");
	const notificationWriterKey = await keyFor("notification-writer");
	const config = {
		lifecycleWriterKey,
		postWriterKey,
		interactionWriterKey,
		notificationWriterKey,
		mediaWriterKey: mediaWriter.secret,
		mediaReaderKey: mediaReader.secret,
		project: "nfe-lifecycle-56",
		proofKey: proofKey.secret,
		sessionKey: sessionKey.secret,
		writerKey: writerKey.secret,
		readerKey: readerKey.secret,
	};
	await Bun.write(`${state}/credentials.json`, JSON.stringify(config));
	await chmod(`${state}/credentials.json`, 0o600);
	return config;
}
