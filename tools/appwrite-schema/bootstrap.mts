import assert from "node:assert/strict";
import { endpoint, state } from "./local.mts";
export async function bootstrap(): Promise<{
	project: string;
	key: string;
	version: string;
}> {
	if (process.env.NFE_SCHEMA_LOCAL !== "1")
		throw new Error(
			"Set NFE_SCHEMA_LOCAL=1 to opt in to synthetic local writes",
		);
	if (!(await Bun.file(`${state}/compose.json`).exists()))
		throw new Error("Run prepare:local and up first");
	const versionResponse = await fetch(`${endpoint}/health/version`);
	assert.equal(versionResponse.status, 200);
	const version = (await versionResponse.json()) as { version: string };
	assert.equal(version.version, "2.6.2");
	const configFile = Bun.file(`${state}/credentials.json`);
	if (await configFile.exists())
		return { ...(await configFile.json()), version: version.version };
	let cookie = "";
	async function consoleRequest(path: string, body?: object) {
		const response = await fetch(`${endpoint}${path}`, {
			method: body ? "POST" : "GET",
			headers: {
				"Content-Type": "application/json",
				"X-Appwrite-Project": "console",
				Origin: "http://localhost",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = (await response.json()) as {
			$id: string;
			secret: string;
			type?: string;
		};
		if (!response.ok)
			throw Object.assign(new Error("Console bootstrap failed"), {
				stage: path,
				code: response.status,
				type: data.type,
			});
		const cookies = response.headers.getSetCookie();
		if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
		return data;
	}
	async function ensureConsole(
		path: string,
		body: { teamId?: string; projectId?: string; name: string },
	) {
		try {
			return await consoleRequest(`${path}/${body.projectId ?? body.teamId}`);
		} catch (error) {
			if ((error as { code?: number }).code !== 404) throw error;
			return await consoleRequest(path, body);
		}
	}
	const adminFile = Bun.file(`${state}/admin.json`);
	const { password } = (await adminFile.exists())
		? await adminFile.json()
		: { password: `Probe-${crypto.randomUUID()}-Aa1!` };
	await Bun.write(adminFile, JSON.stringify({ password }), { mode: 0o600 });
	try {
		await consoleRequest("/account", {
			userId: "schema-admin",
			email: "schema-admin@example.test",
			password,
			name: "Synthetic probe admin",
		});
	} catch (error) {
		if ((error as { type?: string }).type !== "user_console_count_exceeded")
			throw error;
	}
	await consoleRequest("/account/sessions/email", {
		email: "schema-admin@example.test",
		password,
	});
	const team = await ensureConsole("/teams", {
		teamId: "schema-team",
		name: "Synthetic probe team",
	});
	await ensureConsole("/projects", {
		projectId: "nfe-schema",
		name: "NFE synthetic migration probe",
		teamId: team.$id,
	});
	const key = await consoleRequest("/projects/nfe-schema/keys", {
		keyId: "schema-key",
		name: "Disposable probe only",
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
	const credentials = { project: "nfe-schema", key: key.secret };
	await Bun.write(configFile, JSON.stringify(credentials), { mode: 0o600 });
	return { ...credentials, version: version.version };
}
