import assert from "node:assert/strict";
import { parse } from "yaml";
import {
	command,
	fresh,
	hash,
	identity,
	local,
	privateDir,
	privateWrite,
} from "./core.mts";

export const upstream = {
	commit: "54581f9698f9de23cf4b1432e353b3ee9b0012d5",
	sha256: "db8f3fb69b5ff026d3b76dd0f87b13b37cd009a838ae63e48b134292b9f6bea6",
};
export type Topology = {
	name: string;
	services: Record<string, any>;
	volumes: Record<string, object>;
	networks: Record<string, any>;
};
export const networksFor = (project: string) => ({
	private: {
		internal: true,
		ipam: {
			config: [
				{
					subnet: `10.245.${project.startsWith("nfe47-source-") ? 47 : 48}.0/24`,
				},
			],
		},
	},
	edge: {
		ipam: {
			config: [
				{
					subnet: `10.245.${project.startsWith("nfe47-source-") ? 147 : 148}.0/24`,
				},
			],
		},
	},
});
export const directory = (project: string) => `${local}/${identity(project)}`;
export async function save(topology: Topology) {
	await privateDir(directory(topology.name));
	await privateWrite(
		`${directory(topology.name)}/compose.json`,
		JSON.stringify(topology),
	);
}
export async function compose(project: string, ...args: string[]) {
	identity(project);
	return command([
		"docker",
		"compose",
		"-p",
		project,
		"-f",
		`${directory(project)}/compose.json`,
		...args,
	]);
}
export async function sql(project: string, query: string) {
	return command(
		[
			"docker",
			"compose",
			"-p",
			identity(project),
			"-f",
			`${directory(project)}/compose.json`,
			"exec",
			"-T",
			"source",
			"psql",
			"-U",
			"synthetic",
			"-d",
			"source",
			"-v",
			"ON_ERROR_STOP=1",
			"-At",
		],
		query,
	);
}
export async function generate(
	project: string,
	port: number,
): Promise<Topology> {
	identity(project);
	assert.ok(project.startsWith("nfe47-source-"));
	assert.equal(port, 19547);
	await fresh(project);
	const response = await fetch(
		`https://raw.githubusercontent.com/appwrite/appwrite/${upstream.commit}/docker-compose.yml`,
	);
	assert.ok(response.ok);
	const source = await response.text();
	assert.equal(hash(source), upstream.sha256);
	const upstreamCompose = parse(source);
	const secret = () => crypto.getRandomValues(new Uint8Array(32)).toHex();
	const env = {
		_APP_ENV: "production",
		_APP_EDITION: "self-hosted",
		_APP_DOMAIN: "localhost",
		_APP_CONSOLE_DOMAIN: "localhost",
		_APP_CONSOLE_HOSTNAMES: "localhost,127.0.0.1",
		_APP_OPTIONS_FORCE_HTTPS: "disabled",
		_APP_OPTIONS_ABUSE: "disabled",
		_APP_OPENSSL_KEY_V1: secret(),
		_APP_JOBS_SECRET: secret(),
		_APP_GEO_SECRET: secret(),
		_APP_DB_ADAPTER: "postgresql",
		_APP_DB_HOST: "postgresql",
		_APP_DB_PORT: "5432",
		_APP_DB_SCHEMA: "appwrite",
		_APP_DB_USER: "probe",
		_APP_DB_PASS: secret(),
		_APP_REDIS_HOST: "redis",
		_APP_REDIS_PORT: "6379",
		_APP_WORKER_PER_CORE: "1",
		_APP_WORKERS_NUM: "1",
		_APP_WORKER_MAX_COROUTINES: "4",
		_APP_USAGE_STATS: "disabled",
		_APP_DOCUMENTSDB: "disabled",
		_APP_VECTORSDB: "disabled",
		_APP_EMBEDDING: "disabled",
		// No mail worker or SMTP provider exists in this synthetic topology.
	};
	const services: Topology["services"] = {};
	const volumes: Topology["volumes"] = { "source-data": {} };
	for (const name of [
		"appwrite",
		"appwrite-worker-databases",
		"appwrite-worker-deletes",
		"appwrite-geo",
		"postgresql",
		"redis",
	]) {
		const original = upstreamCompose.services[name];
		const service: any = { image: original.image, networks: ["private"] };
		for (const key of [
			"entrypoint",
			"command",
			"volumes",
			"healthcheck",
			"init",
			"shm_size",
		])
			if (original[key]) service[key] = original[key];
		if (name.startsWith("appwrite") && name !== "appwrite-geo") {
			service.image = "appwrite/appwrite:2.6.2";
			service.environment = env;
			service.depends_on = {
				postgresql: { condition: "service_healthy" },
				redis: { condition: "service_healthy" },
			};
		}
		if (name === "appwrite-geo")
			service.environment = { GEO_SECRET: env._APP_GEO_SECRET };
		if (name === "postgresql") {
			service.environment = {
				POSTGRES_DB: "appwrite",
				POSTGRES_USER: "probe",
				POSTGRES_PASSWORD: env._APP_DB_PASS,
			};
			service.healthcheck.test = [
				"CMD-SHELL",
				"pg_isready -U probe -d appwrite",
			];
		}
		for (const volume of service.volumes ?? []) {
			assert.match(volume, /^[a-z][a-z0-9-]*:\//);
			volumes[volume.split(":")[0]] = {};
		}
		services[name] = service;
	}
	services.source = {
		image: services.postgresql.image,
		networks: ["private"],
		environment: {
			POSTGRES_DB: "source",
			POSTGRES_USER: "synthetic",
			POSTGRES_PASSWORD: secret(),
		},
		volumes: ["source-data:/var/lib/postgresql/data"],
		healthcheck: {
			test: ["CMD-SHELL", "pg_isready -U synthetic -d source"],
			interval: "2s",
			timeout: "5s",
			retries: 60,
		},
	};
	// nginx config is inline, hence included in the encrypted Compose configuration.
	services.proxy = {
		image: "nginx:1.28.0-alpine",
		networks: ["private", "edge"],
		ports: [`127.0.0.1:${port}:8080`],
		entrypoint: [
			"/bin/sh",
			"-c",
			"printf '%s' 'events {} http { server { listen 8080; location /v1/ { proxy_pass http://appwrite:80; } } }' > /etc/nginx/nginx.conf; exec nginx -g 'daemon off;'",
		],
		depends_on: { appwrite: { condition: "service_healthy" } },
	};
	return {
		name: project,
		services,
		volumes,
		networks: networksFor(project),
	};
}
export function assertTopology(t: Topology) {
	identity(t.name);
	assert.equal(t.networks.private.internal, true);
	assert.deepEqual(t.networks, networksFor(t.name));
	assert.ok(t.services.appwrite.environment._APP_OPENSSL_KEY_V1);
	assert.equal(t.services.appwrite.image, "appwrite/appwrite:2.6.2");
	assert.equal(t.services.appwrite.environment._APP_DB_ADAPTER, "postgresql");
	assert.equal(t.services.appwrite.environment._APP_DB_HOST, "postgresql");
	assert.equal(t.services.appwrite.environment._APP_DB_SCHEMA, "appwrite");
	assert.equal(t.services.source.environment.POSTGRES_DB, "source");
	assert.equal(t.services.source.environment.POSTGRES_USER, "synthetic");
	assert.deepEqual(t.services.proxy.ports, [
		`127.0.0.1:${t.name.startsWith("nfe47-source-") ? 19547 : 19548}:8080`,
	]);
	assert.deepEqual(
		Object.keys(t.services).sort(),
		[
			"appwrite",
			"appwrite-geo",
			"appwrite-worker-databases",
			"appwrite-worker-deletes",
			"postgresql",
			"proxy",
			"redis",
			"source",
		].sort(),
	);
	for (const [name, service] of Object.entries(t.services)) {
		assert.ok(
			!service.privileged && !service.network_mode && !service.container_name,
		);
		if (name !== "proxy") {
			assert.ok(!service.ports);
			assert.deepEqual(service.networks, ["private"]);
		}
		for (const mount of service.volumes ?? []) {
			assert.match(mount, /^[a-z][a-z0-9-]*:\//);
			assert.ok(Object.hasOwn(t.volumes, mount.split(":")[0]));
		}
	}
	for (const volume of Object.values(t.volumes)) assert.deepEqual(volume, {});
	for (const key of Object.keys(t.volumes))
		assert.match(key, /^[a-z][a-z0-9-]*$/);
}
export async function owned(project: string) {
	const t: Topology = await Bun.file(
		`${directory(project)}/compose.json`,
	).json();
	assert.equal(t.name, project);
	assertTopology(t);
	for (const id of (await compose(project, "ps", "-aq"))
		.toString()
		.trim()
		.split("\n")
		.filter(Boolean)) {
		const [inspection] = JSON.parse(
			(await command(["docker", "inspect", id])).toString(),
		);
		assert.equal(
			inspection.Config.Labels["com.docker.compose.project"],
			project,
		);
		assert.equal(
			inspection.Config.Labels["com.docker.compose.project.config_files"],
			`${directory(project)}/compose.json`,
		);
	}
	return t;
}
export async function start(project: string) {
	await owned(project);
	await compose(project, "up", "-d", "--wait", "--wait-timeout", "240");
}
export async function destroy(project: string) {
	await owned(project);
	await compose(project, "down", "--volumes");
}
