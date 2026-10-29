import { chmod, mkdir, rm } from "node:fs/promises";
import { parse } from "yaml";

export const root = import.meta.dir;
export const state = `${root}/.local`;
export const endpoint = "http://127.0.0.1:19549/v1";
const project = "nfe-schema-49";
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
	const [out, err, code] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	if (code)
		throw new Error(
			`${args.slice(0, 2).join(" ")} failed (${code}): ${err.slice(-1500)}`,
		);
	return out;
}
async function prepare() {
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
		port: 19549,
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
		if (name === "appwrite") s.ports = ["127.0.0.1:19549:80"];
		for (const v of s.volumes ?? []) {
			if (v.startsWith("/") || v.startsWith("."))
				throw new Error("Unexpected host bind in reduced compose");
			volumeNames.add(v.split(":")[0]);
		}
		services[name] = s;
	}
	await mkdir(state, { recursive: true, mode: 0o700 });
	await Bun.write(
		`${state}/compose.json`,
		JSON.stringify(
			{
				name: project,
				services,
				networks: {
					probe: { ipam: { config: [{ subnet: "10.245.49.0/24" }] } },
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
	process.stdout.write(
		"Prepared private compose; loopback port 19549; fresh project nfe-schema-49.\n",
	);
}
if (import.meta.main) {
	const action = Bun.argv[2];
	if (action === "prepare") await prepare();
	else if (action === "up") {
		process.stdout.write(
			await command([
				...compose,
				"up",
				"-d",
				"--wait",
				"--wait-timeout",
				"180",
			]),
		);
	} else if (action === "down") {
		process.stdout.write(
			await command([...compose, "down", "--volumes", "--remove-orphans"]),
		);
		await rm(`${state}/credentials.json`, { force: true });
	} else throw new Error("Use prepare | up | down");
}
