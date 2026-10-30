import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { endpoint, state } from "./recovery-local";
export async function bootstrapRecovery() {
	if (
		process.env.NFE_AUTH_SYNTHETIC !== "1" ||
		!(await Bun.file(`${state}/compose.json`).exists())
	)
		throw new Error("Dedicated synthetic opt-in required");
	const health = await fetch(`${endpoint}/health/version`);
	assert.equal(((await health.json()) as { version: string }).version, "2.6.2");
	if (await Bun.file(`${state}/credentials.json`).exists())
		return (await Bun.file(`${state}/credentials.json`).json()) as {
			project: string;
			proofKey: string;
			sessionKey: string;
			brokerKey: string;
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
				"X-Appwrite-Project": path.startsWith("/project/")
					? "nfe-recovery-52"
					: "console",
				...(path.startsWith("/project/") ? { "X-Appwrite-Mode": "admin" } : {}),
				Origin: "http://localhost",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = (await response.json()) as {
			$id: string;
			secret: string;
			enabled?: boolean;
		};
		if (!response.ok && response.status !== 409)
			throw new Error(`Synthetic bootstrap HTTP ${response.status} at ${path}`);
		const cookies = response.headers.getSetCookie();
		if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
		return data;
	}
	const passwordPath = `${state}/console-password`;
	const password = (await Bun.file(passwordPath).exists())
		? await Bun.file(passwordPath).text()
		: `Synthetic-${crypto.randomUUID()}-Aa1!`;
	await Bun.write(passwordPath, password);
	await chmod(passwordPath, 0o600);
	await consoleRequest("/account", {
		userId: "recovery-console",
		email: "recovery-console@example.test",
		password,
		name: "Synthetic console",
	});
	await consoleRequest("/account/sessions/email", {
		email: "recovery-console@example.test",
		password,
	});
	await consoleRequest("/teams", {
		teamId: "recovery-team",
		name: "Recovery synthetic",
	});
	const project = "nfe-recovery-52";
	await consoleRequest("/projects", {
		projectId: project,
		name: "Recovery synthetic",
		teamId: "recovery-team",
	});
	await consoleRequest(`/projects/${project}/platforms`, {
		platformId: "loopback",
		type: "web",
		name: "Loopback only",
		hostname: "127.0.0.1",
	});
	const info = await consoleRequest("/project/policies/session-invalidation");
	assert.equal(
		info.enabled,
		true,
		"Recovery requires all sessions invalidated",
	);
	const proofKey = await consoleRequest(`/projects/${project}/keys`, {
		keyId: "proof-key",
		name: "Synthetic management only",
		scopes: ["users.read", "users.write"],
	});
	const sessionKey = await consoleRequest(`/projects/${project}/keys`, {
		keyId: "session-key",
		name: "General SSR sessions only",
		scopes: ["sessions.write"],
	});
	const brokerKey = await consoleRequest(`/projects/${project}/keys`, {
		keyId: "broker-key",
		name: "Isolated Google broker",
		scopes: ["users.read", "sessions.write"],
	});
	const config = {
		project,
		proofKey: proofKey.secret,
		sessionKey: sessionKey.secret,
		brokerKey: brokerKey.secret,
	};
	await Bun.write(`${state}/credentials.json`, JSON.stringify(config));
	await chmod(`${state}/credentials.json`, 0o600);
	return config;
}
