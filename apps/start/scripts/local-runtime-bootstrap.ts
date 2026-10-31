import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Client, Permission, Role, TablesDB, Users } from "node-appwrite";
import {
	appRoot,
	createPrivate,
	databaseId,
	endpoint,
	loadOrCreate,
	origin,
	projectId,
	readPrivate,
	state,
} from "./local-runtime-state";

const scopes = {
	provision: [
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
	session: ["sessions.write"],
	reader: ["rows.read"],
	writer: ["rows.write"],
};
export type Credentials = {
	project: string;
	provision: string;
	session: string;
	reader: string;
	writer: string;
};
const configPath = `${state}/runtime.json`;
export async function bootstrap() {
	const consoleAccount = await loadOrCreate(`${state}/console.json`, () => ({
		id: "local-console",
		email: "local-console@example.test",
		password: `Synthetic-${crypto.randomUUID()}-Aa1!`,
	}));
	let cookie = "";
	async function request(
		path: string,
		body?: object,
		method = body ? "POST" : "GET",
	) {
		const response = await fetch(`${endpoint}${path}`, {
			method,
			signal: AbortSignal.timeout(15_000),
			headers: {
				"Content-Type": "application/json",
				"X-Appwrite-Project": "console",
				Origin: "http://localhost",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!response.ok)
			throw Object.assign(new Error(`Local bootstrap HTTP${response.status}`), {
				code: response.status,
			});
		const cookies = response.headers.getSetCookie();
		if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
		if (response.status === 204) return { $id: "", secret: "" };
		return (await response.json()) as {
			$id: string;
			secret: string;
			keys?: { $id: string; secret: string; scopes: string[] }[];
		};
	}
	async function ensure(path: string, body: object) {
		try {
			return await request(path, body);
		} catch (error) {
			if ((error as { code?: number }).code !== 409) throw error;
		}
	}
	await ensure("/account", {
		userId: consoleAccount.id,
		email: consoleAccount.email,
		password: consoleAccount.password,
		name: "Synthetic local console",
	});
	await request("/account/sessions/email", {
		email: consoleAccount.email,
		password: consoleAccount.password,
	});
	try {
		await ensure("/teams", { teamId: "local-team", name: "Synthetic local" });
		await ensure("/projects", {
			projectId,
			name: "NFE synthetic local",
			teamId: "local-team",
		});
		const saved = `${state}/credentials.json`;
		let credentials: Credentials;
		if (await Bun.file(saved).exists())
			credentials = await readPrivate<Credentials>(saved);
		else {
			const keys = (await request(`/projects/${projectId}/keys`)).keys ?? [];
			credentials = {
				project: projectId,
				provision: "",
				session: "",
				reader: "",
				writer: "",
			};
			for (const name of [
				"provision",
				"session",
				"reader",
				"writer",
			] as const) {
				const keyId = `local-${name}`;
				const found = keys.find((k) => k.$id === keyId);
				if (found)
					assert.deepEqual(
						[...found.scopes].sort(),
						[...scopes[name]].sort(),
						"Local key scope drift",
					);
				const key =
					found ??
					(await request(`/projects/${projectId}/keys`, {
						keyId,
						name: `Local ${name}`,
						scopes: scopes[name],
					}));
				assert.ok(
					key.secret,
					"Existing local key unavailable; do not reset credentials",
				);
				credentials[name] = key.secret;
			}
			await createPrivate(saved, credentials);
		}
		assert.equal(credentials.project, projectId);
		return credentials;
	} finally {
		await request("/account/sessions/current", undefined, "DELETE");
	}
}
export async function provisionLocal(credentials: Credentials) {
	const client = new Client()
		.setEndpoint(endpoint)
		.setProject(projectId)
		.setKey(credentials.provision);
	const db = new TablesDB(client),
		users = new Users(client);
	const directory = resolve(appRoot, "../../tools/appwrite-schema");
	const { provision } = await import(`${directory}/provision.mts`);
	const { schemaDigest } = await import(`${directory}/schema.mts`);
	const { provisionProfileV2 } = await import(`${directory}/profile-v2.mts`);
	const { provisionMediaV3 } = await import(`${directory}/media-v3.mts`);
	const { provisionMessaging } = await import(`${directory}/messaging.mts`);
	let baseline: { digest: string } | undefined;
	try {
		baseline = (await db.getRow({
			databaseId,
			tableId: "schema_versions",
			rowId: "v1",
		})) as unknown as { digest: string };
	} catch (error) {
		if ((error as { code?: number }).code !== 404) throw error;
	}
	if (!baseline) await provision(db, databaseId);
	else assert.equal(baseline.digest, schemaDigest, "Schema baseline drift");
	await provisionProfileV2(db, databaseId);
	await provisionMediaV3(db, databaseId);
	await provisionMessaging(db, databaseId);
	const fixture = await loadOrCreate(`${state}/fixture.json`, () => ({
		id: "local-player",
		email: "local-player@example.test",
		password: `Synthetic-${crypto.randomUUID()}-Aa1!`,
	}));
	try {
		await users.get({ userId: fixture.id });
	} catch (error) {
		if ((error as { code?: number }).code !== 404) throw error;
		await users.create({
			userId: fixture.id,
			email: fixture.email,
			password: fixture.password,
			name: "Synthetic local player",
		});
	}
	// Existing profiles are left untouched, including user edits and timestamps.
	for (const [tableId, data, permissions] of [
		[
			"profiles",
			{
				name: "Synthetic local player",
				nameFolded: "synthetic local player",
				image: null,
				biography: null,
				localisation: "Paris",
				position: [],
				foot: [],
				userType: "PLAYER",
				isOnboarded: true,
				createdAt: "2026-10-31T00:00:00.000Z",
				updatedAt: null,
			},
			[Permission.read(Role.any())],
		],
		[
			"private_profiles",
			{ role: "USER" },
			[
				Permission.read(Role.user(fixture.id)),
				Permission.read(Role.label("admin")),
			],
		],
	] as const) {
		try {
			await db.getRow({ databaseId, tableId, rowId: fixture.id });
		} catch (error) {
			if ((error as { code?: number }).code !== 404) throw error;
			await db.createRow({
				databaseId,
				tableId,
				rowId: fixture.id,
				data,
				permissions: [...permissions],
			});
		}
	}
	return fixture;
}
export async function configure(credentials: Credentials) {
	const config: Record<string, string> = {
		NODE_ENV: "production",
		PORT: "3564",
		START_LOCAL_RUNTIME: "1",
		START_APP_ORIGIN: origin,
		START_APPWRITE_ENDPOINT: endpoint,
		START_APPWRITE_PROJECT: projectId,
		START_APPWRITE_DATABASE: databaseId,
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		START_APPWRITE_SESSION_KEY: credentials.session,
		START_APPWRITE_FEED_READER_KEY: credentials.reader,
		START_APPWRITE_MODERATION_READER_KEY: credentials.reader,
		START_APPWRITE_MEDIA_READER_KEY: credentials.reader,
	};
	for (const name of [
		"PROFILE",
		"FOLLOW",
		"INTERACTION",
		"MESSAGING",
		"MODERATION",
		"POST_TEXT",
		"MEDIA",
	])
		config[`START_APPWRITE_${name}_WRITER_KEY`] = credentials.writer;
	if (await Bun.file(configPath).exists())
		assert.deepEqual(
			await readPrivate(configPath),
			config,
			"Existing runtime configuration differs; refusing overwrite",
		);
	else await createPrivate(configPath, config);
	return config;
}
