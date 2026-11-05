import { chmod, mkdir, rm } from "node:fs/promises";
import { Client, TablesDB } from "node-appwrite";
import { parse } from "yaml";
import { targetBinding } from "./target";

export const root = import.meta.dir;
export const state = `${root}/.local`;
export const endpoint = "http://127.0.0.1:18663/v1";
const project = "nfe-import-63";
const compose = [
	"docker",
	"compose",
	"--project-name",
	project,
	"--file",
	`${state}/compose.json`,
];
async function command(args: string[]) {
	const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const [out, _err, code] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	if (code) throw new Error(`local_command_failed (${code})`);
	return out;
}
export async function prepare() {
	if (await Bun.file(`${state}/compose.json`).exists())
		throw new Error(
			"Local state already exists; use down before removing .local manually.",
		);
	const collision = await command([
		"docker",
		"ps",
		"-aq",
		"--filter",
		`label=com.docker.compose.project=${project}`,
	]);
	const volumes = await command([
		"docker",
		"volume",
		"ls",
		"-q",
		"--filter",
		`label=com.docker.compose.project=${project}`,
	]);
	if (collision.trim() || volumes.trim())
		throw new Error("Existing probe resources found; refusing reuse.");
	const info = JSON.parse(
		await command(["docker", "info", "--format", "{{json .}}"]),
	);
	if (info.NCPU < 2 || info.MemTotal < 8 * 1024 ** 3)
		throw new Error(
			"Require >=2 CPU and >=8 GiB Docker memory; inspect current usage before up.",
		);
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 18663,
		fetch: () => new Response(""),
	});
	server.stop(true);
	const upstream = await fetch(
		"https://raw.githubusercontent.com/appwrite/appwrite/54581f9698f9de23cf4b1432e353b3ee9b0012d5/docker-compose.yml",
	);
	if (!upstream.ok) throw new Error(`Upstream compose HTTP ${upstream.status}`);
	const source = await upstream.text();
	const parsed = parse(source);
	const env: Record<string, string> = {
		_APP_ENV: "production",
		_APP_EDITION: "self-hosted",
		_APP_DOMAIN: "localhost",
		_APP_CONSOLE_DOMAIN: "localhost",
		_APP_CONSOLE_HOSTNAMES: "localhost,127.0.0.1",
		_APP_OPTIONS_FORCE_HTTPS: "disabled",
		_APP_OPTIONS_ABUSE: "disabled",
		_APP_OPENSSL_KEY_V1: crypto.randomUUID().replaceAll("-", ""),
		_APP_JOBS_SECRET: crypto.randomUUID().replaceAll("-", ""),
		_APP_DB_ADAPTER: "postgresql",
		_APP_DB_HOST: "postgresql",
		_APP_DB_PORT: "5432",
		_APP_DB_SCHEMA: "appwrite",
		_APP_DB_USER: "probe",
		_APP_DB_PASS: crypto.randomUUID(),
		_APP_REDIS_HOST: "redis",
		_APP_REDIS_PORT: "6379",
		_APP_WORKER_PER_CORE: "1",
		_APP_WORKERS_NUM: "1",
		_APP_WORKER_MAX_COROUTINES: "4",
		_APP_USAGE_STATS: "disabled",
		_APP_DOCUMENTSDB: "disabled",
		_APP_VECTORSDB: "disabled",
		_APP_EMBEDDING: "disabled",
		_APP_GEO_SECRET: crypto.randomUUID(),
	};
	const services: Record<string, Record<string, unknown>> = {};
	const volumeNames = new Set<string>();
	for (const name of [
		"appwrite",
		"appwrite-worker-databases",
		"appwrite-worker-deletes",
		"redis",
		"postgresql",
		"appwrite-geo",
	]) {
		const s = parsed.services[name];
		s.container_name = undefined;
		s.profiles = undefined;
		s.labels = undefined;
		s.restart = undefined;
		s.extra_hosts = undefined;
		s.networks = ["probe"];
		if (name.startsWith("appwrite") && name !== "appwrite-geo") {
			s.image = "appwrite/appwrite:2.6.2";
			s.environment = env;
			s.depends_on = [
				"redis",
				"postgresql",
				...(name === "appwrite" ? ["appwrite-geo"] : []),
			];
		}
		if (name === "appwrite-geo")
			s.environment = { GEO_SECRET: env._APP_GEO_SECRET };
		if (name === "postgresql")
			s.environment = {
				POSTGRES_DB: "appwrite",
				POSTGRES_USER: "probe",
				POSTGRES_PASSWORD: env._APP_DB_PASS,
			};
		if (name === "postgresql")
			s.healthcheck.test = ["CMD-SHELL", "pg_isready -U probe -d appwrite"];
		if (name === "appwrite") s.ports = ["127.0.0.1:18663:80"];
		for (const v of s.volumes ?? []) {
			if (v.startsWith("/") || v.startsWith("."))
				throw new Error("Unexpected host bind in reduced compose");
			volumeNames.add(v.split(":")[0]);
		}
		services[name] = s;
	}
	await mkdir(state, { recursive: true, mode: 0o700 });
	await chmod(state, 0o700);
	await Bun.write(
		`${state}/compose.json`,
		JSON.stringify(
			{
				name: project,
				services,
				networks: {
					probe: { ipam: { config: [{ subnet: "10.246.63.0/24" }] } },
				},
				volumes: Object.fromEntries([...volumeNames].map((v) => [v, {}])),
			},
			null,
			2,
		),
	);
	await chmod(`${state}/compose.json`, 0o600);
	await Bun.write(
		`${state}/source.json`,
		JSON.stringify({
			release: "2.6.2",
			commit: "54581f9698f9de23cf4b1432e353b3ee9b0012d5",
			sha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
		}),
	);
	await chmod(`${state}/source.json`, 0o600);
	process.stdout.write(
		"Prepared private compose; loopback port 18663; fresh project nfe-import-63.\n",
	);
}
export const projectId = "nfe-import-63-proof";
export const databaseId = "nfe-business";

export async function bootstrap() {
	if (!(await Bun.file(`${state}/compose.json`).exists()))
		throw new Error("local_prepare_required");
	targetBinding(endpoint, projectId, databaseId);
	const health = await fetch(`${endpoint}/health/version`);
	if (
		!health.ok ||
		((await health.json()) as { version: string }).version !== "2.6.2"
	)
		throw new Error("local_version_mismatch");
	const configFile = Bun.file(`${state}/credentials.json`);
	if (await configFile.exists()) {
		const saved = (await configFile.json()) as { project: string; key: string };
		if (saved.project !== projectId || !saved.key)
			throw new Error("invalid_local_credentials");
		return saved;
	}
	let cookie = "";
	async function request(path: string, body: object) {
		const response = await fetch(`${endpoint}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Appwrite-Project": "console",
				Origin: "http://localhost",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: JSON.stringify(body),
		});
		if (!response.ok)
			throw new Error(`local_bootstrap_failed_${response.status}`);
		const cookies = response.headers.getSetCookie();
		if (cookies.length)
			cookie = cookies.map((value) => value.split(";")[0]).join("; ");
		return (await response.json()) as { $id: string; secret: string };
	}
	const password = `Probe-${crypto.randomUUID()}-Aa1!`;
	// A partial bootstrap must be discarded, never adopted as another authority.
	await request("/account", {
		userId: "import-admin",
		email: "import-admin@example.test",
		password,
		name: "Synthetic import admin",
	});
	await request("/account/sessions/email", {
		email: "import-admin@example.test",
		password,
	});
	const team = await request("/teams", {
		teamId: "import-team",
		name: "Synthetic import team",
	});
	await request("/projects", {
		projectId,
		name: "Synthetic business import",
		teamId: team.$id,
	});
	const key = await request(`/projects/${projectId}/keys`, {
		keyId: "import-key",
		name: "Disposable import proof",
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
	if (!key.secret) throw new Error("local_key_missing");
	// Separate application capabilities make the imported development dataset
	// usable by the built Start app without exposing the broad import key.
	const runtimeKeys: Record<string, string> = {};
	for (const name of [
		"SESSION",
		"PROFILE_WRITER",
		"FEED_READER",
		"FOLLOW_WRITER",
		"INTERACTION_WRITER",
		"MEDIA_READER",
		"MEDIA_WRITER",
		"MESSAGING_WRITER",
		"MODERATION_READER",
		"MODERATION_WRITER",
		"NOTIFICATION_WRITER",
		"POST_TEXT_WRITER",
		"LIFECYCLE_WRITER",
		"ACCOUNT_LIFECYCLE_WRITER",
	]) {
		const scopes =
			name === "SESSION"
				? ["sessions.write"]
				: name === "ACCOUNT_LIFECYCLE_WRITER"
					? ["rows.read", "rows.write", "users.read", "users.write"]
					: name.endsWith("READER")
						? ["rows.read"]
						: ["rows.read", "rows.write"];
		const capability = await request(`/projects/${projectId}/keys`, {
			keyId: name.toLowerCase().replaceAll("_", "-"),
			name: `Development ${name}`,
			scopes,
		});
		if (!capability.secret) throw new Error("local_runtime_key_missing");
		runtimeKeys[`START_APPWRITE_${name}_KEY`] = capability.secret;
	}
	const credentials = { project: projectId, key: key.secret, runtimeKeys };
	await Bun.write(configFile, JSON.stringify(credentials), { mode: 0o600 });
	await chmod(`${state}/credentials.json`, 0o600);
	return credentials;
}

export async function provisionLocal() {
	const credentials = await bootstrap();
	const db = new TablesDB(
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(credentials.key),
	);
	const directory = `${import.meta.dir}/../appwrite-schema`;
	const steps = [
		["provision.mts", "provision"],
		["profile-v2.mts", "provisionProfileV2"],
		["media-v3.mts", "provisionMediaV3"],
		["messaging.mts", "provisionMessaging"],
		["notification-v1.mts", "provisionNotificationV1"],
		["lifecycle-v1.mts", "provisionLifecycleV1"],
		["account-lifecycle-v1.mts", "provisionAccountLifecycleV1"],
		["home-v1.mts", "provisionHomeV1"],
	] as const;
	for (const [file, name] of steps) {
		const module = (await import(`${directory}/${file}`)) as Record<
			string,
			(db: TablesDB, database: string) => Promise<unknown>
		>;
		const provisioner = module[name];
		if (!provisioner) throw new Error("local_provisioner_missing");
		await provisioner(db, databaseId);
	}
}

if (import.meta.main) {
	try {
		const action = Bun.argv[2];
		if (action === "prepare") await prepare();
		else if (action === "up") {
			await command([
				...compose,
				"up",
				"-d",
				"--wait",
				"--wait-timeout",
				"180",
			]);
			process.stdout.write("Local services started.\n");
		} else if (action === "bootstrap") {
			await provisionLocal();
			process.stdout.write("Local schema provisioned.\n");
		} else if (action === "down") {
			await command([...compose, "down", "--volumes", "--remove-orphans"]);
			await rm(`${state}/credentials.json`, { force: true });
			process.stdout.write("Local services removed.\n");
		} else throw new Error("Use prepare | up | bootstrap | down");
	} catch {
		process.stderr.write(
			"Local operation failed; inspect private local state before retrying.\n",
		);
		process.exitCode = 1;
	}
}
