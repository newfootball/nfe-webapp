import assert from "node:assert/strict";
import { chmod, mkdir } from "node:fs/promises";
import { parse } from "yaml";

export const root = import.meta.dir;
export const state = `${root}/.local`;
export const source = {
	release: "2.6.2",
	commit: "54581f9698f9de23cf4b1432e353b3ee9b0012d5",
	sha256: "db8f3fb69b5ff026d3b76dd0f87b13b37cd009a838ae63e48b134292b9f6bea6",
};
export type Config = {
	environment: "local";
	project: string;
	port: number;
	browserPort: number;
	privateSubnet: string;
	edgeSubnet: string;
};
export async function config(): Promise<Config> {
	const c = await Bun.file(`${state}/config.json`).json();
	assert.equal(
		c.environment,
		"local",
		"Remote deployment is deliberately unsupported",
	);
	assert.match(c.project, /^nfe46-local(?:-[a-z0-9]{1,20})?$/);
	for (const port of [c.port, c.browserPort])
		assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
	assert.notEqual(c.port, c.browserPort);
	for (const subnet of [c.privateSubnet, c.edgeSubnet])
		assert.match(subnet, /^10\.245\.\d{1,3}\.0\/24$/);
	assert.notEqual(c.privateSubnet, c.edgeSubnet);
	return c;
}
// Never forward Docker error output: it may contain rendered environment values.
export async function command(args: string[]) {
	const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const [stdout, , code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	assert.equal(
		code,
		0,
		`${args[0]} ${args[1]} failed; inspect privately (output suppressed)`,
	);
	return stdout;
}
export async function compose(...args: string[]) {
	const c = await config();
	return command([
		"docker",
		"compose",
		"--project-name",
		c.project,
		"--file",
		`${state}/compose.json`,
		...args,
	]);
}
export async function privateWrite(path: string, data: unknown) {
	await Bun.write(
		path,
		typeof data === "string" ? data : JSON.stringify(data, null, 2),
		{ mode: 0o600 },
	);
	await chmod(path, 0o600);
}
async function prepare() {
	assert.equal(
		await Bun.file(`${state}/compose.json`).exists(),
		false,
		"Already prepared; preserve existing secrets and volumes",
	);
	const template = await Bun.file(
		Bun.argv[3] ?? `${root}/local.example.json`,
	).json();
	await mkdir(state, { recursive: true, mode: 0o700 });
	await privateWrite(`${state}/config.json`, template);
	const c = await config();
	for (const resource of ["container", "volume", "network"]) {
		const result = await command([
			"docker",
			resource,
			"ls",
			"-q",
			"--filter",
			`label=com.docker.compose.project=${c.project}`,
		]);
		assert.equal(
			result.trim(),
			"",
			"Project already owns resources; refuse adopting unknown data",
		);
	}
	for (const port of [c.port, c.browserPort]) {
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port,
			fetch: () => new Response(""),
		});
		server.stop(true);
	}
	const response = await fetch(
		`https://raw.githubusercontent.com/appwrite/appwrite/${source.commit}/docker-compose.yml`,
	);
	assert.ok(response.ok);
	const upstream = await response.text();
	assert.equal(
		new Bun.CryptoHasher("sha256").update(upstream).digest("hex"),
		source.sha256,
		"Upstream hash mismatch",
	);
	const parsed = parse(upstream);
	const secret = () => crypto.getRandomValues(new Uint8Array(32)).toHex();
	const env = {
		_APP_ENV: "production",
		_APP_EDITION: "self-hosted",
		_APP_DOMAIN: "localhost",
		_APP_CONSOLE_DOMAIN: "localhost",
		_APP_CONSOLE_HOSTNAMES: "localhost,127.0.0.1",
		_APP_OPTIONS_FORCE_HTTPS: "disabled",
		_APP_OPTIONS_ABUSE: "enabled",
		_APP_OPENSSL_KEY_V1: secret(),
		_APP_JOBS_SECRET: secret(),
		_APP_GEO_SECRET: secret(),
		_APP_DB_ADAPTER: "postgresql",
		_APP_DB_HOST: "postgresql",
		_APP_DB_PORT: "5432",
		_APP_DB_SCHEMA: "appwrite",
		_APP_DB_USER: "nfe",
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
		_APP_SMTP_HOST: "mailpit",
		_APP_SMTP_PORT: "1025",
		_APP_SMTP_SECURE: "",
		_APP_SMTP_USERNAME: "",
		_APP_SMTP_PASSWORD: "",
		_APP_SYSTEM_EMAIL_NAME: "NFE local capture",
		_APP_SYSTEM_EMAIL_ADDRESS: "auth@example.test",
		_APP_STORAGE_LIMIT: "20971520",
	};
	const services: Record<string, Record<string, unknown>> = {};
	const volumes = new Set<string>();
	for (const name of [
		"appwrite",
		"appwrite-worker-databases",
		"appwrite-worker-deletes",
		"appwrite-worker-mails",
		"redis",
		"postgresql",
		"appwrite-geo",
	]) {
		const original = parsed.services[name];
		const s: Record<string, unknown> = {
			image: original.image,
			networks: ["private"],
			restart: "unless-stopped",
			logging: {
				driver: "json-file",
				options: { "max-size": "10m", "max-file": "3" },
			},
		};
		for (const key of [
			"entrypoint",
			"command",
			"volumes",
			"healthcheck",
			"init",
			"shm_size",
		])
			if (original[key]) s[key] = original[key];
		if (name.startsWith("appwrite") && name !== "appwrite-geo") {
			s.image = "appwrite/appwrite:2.6.2";
			s.environment = env;
			s.depends_on = {
				postgresql: { condition: "service_healthy" },
				redis: { condition: "service_healthy" },
				mailpit: { condition: "service_healthy" },
			};
		}
		if (name === "appwrite-geo")
			s.environment = { GEO_SECRET: env._APP_GEO_SECRET };
		if (name === "postgresql") {
			s.environment = {
				POSTGRES_DB: "appwrite",
				POSTGRES_USER: "nfe",
				POSTGRES_PASSWORD: env._APP_DB_PASS,
			};
			s.healthcheck = {
				test: ["CMD-SHELL", "pg_isready -U nfe -d appwrite"],
				interval: "5s",
				timeout: "5s",
				retries: 30,
			};
		}
		if (name === "redis") s.command = ["redis-server", "--appendonly", "yes"];
		for (const v of (s.volumes ?? []) as string[]) {
			assert.ok(
				!v.startsWith("/") && !v.startsWith("."),
				"No upstream host binds allowed",
			);
			volumes.add(v.split(":")[0]);
		}
		services[name] = s;
	}
	volumes.add("mailpit");
	services.mailpit = {
		image: "axllent/mailpit:v1.27.10",
		networks: ["private"],
		restart: "unless-stopped",
		environment: {
			MP_DATABASE: "/data/mailpit.db",
			MP_WEBROOT: "/mail/",
			MP_MAX_MESSAGES: "100",
			MP_DISABLE_VERSION_CHECK: "true",
		},
		volumes: ["mailpit:/data"],
		healthcheck: {
			test: ["CMD", "/mailpit", "readyz"],
			interval: "5s",
			timeout: "5s",
			retries: 30,
		},
	};
	await privateWrite(
		`${state}/nginx.conf`,
		`events {}\nhttp {
 limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
 server { listen 8080; client_max_body_size 20m;
 location /v1/ { limit_req zone=api burst=40 nodelay; proxy_pass http://appwrite:80; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $remote_addr; }
 location /mail/ { proxy_pass http://mailpit:8025; }
 location / { return 404; }
 }\n}\n`,
	);
	services.proxy = {
		image: "nginx:1.28.0-alpine",
		networks: ["edge", "private"],
		restart: "unless-stopped",
		ports: [`127.0.0.1:${c.port}:8080`],
		volumes: [`${state}/nginx.conf:/etc/nginx/nginx.conf:ro`],
		depends_on: { appwrite: { condition: "service_healthy" } },
		healthcheck: {
			test: [
				"CMD-SHELL",
				"wget -q -O /dev/null http://127.0.0.1:8080/v1/health/version",
			],
			interval: "5s",
			timeout: "5s",
			retries: 30,
		},
	};
	for (const s of Object.values(services))
		s.logging = {
			driver: "json-file",
			options: { "max-size": "10m", "max-file": "3" },
		};
	await privateWrite(`${state}/compose.json`, {
		name: c.project,
		services,
		volumes: Object.fromEntries([...volumes].map((v) => [v, {}])),
		networks: {
			private: {
				internal: true,
				ipam: { config: [{ subnet: c.privateSubnet }] },
			},
			edge: { ipam: { config: [{ subnet: c.edgeSubnet }] } },
		},
	});
	await validate();
}
export async function validate() {
	const c = await config();
	const rendered = JSON.parse(await compose("config", "--format", "json"));
	assert.equal(rendered.name, c.project);
	assert.equal(rendered.networks.private.internal, true);
	for (const [name, s] of Object.entries(rendered.services) as [
		string,
		{
			ports?: unknown[];
			networks: Record<string, unknown>;
			environment?: Record<string, string>;
			volumes?: { source: string }[];
		},
	][]) {
		assert.ok(
			name === "proxy" || !s.ports?.length,
			"Only proxy can publish ports",
		);
		assert.ok(
			name === "proxy" || !("edge" in s.networks),
			"Only proxy can reach edge network",
		);
		assert.ok(!s.volumes?.some((v) => v.source.includes("docker.sock")));
	}
	assert.equal(
		rendered.services.appwrite.environment._APP_SMTP_HOST,
		"mailpit",
	);
	assert.equal(rendered.services.proxy.ports.length, 1);
	assert.equal(rendered.services.proxy.ports[0].host_ip, "127.0.0.1");
	process.stdout.write(
		"Compose validated; secrets suppressed; private network and proxy-only exposure confirmed.\n",
	);
}
if (import.meta.main) {
	try {
		const action = Bun.argv[2];
		if (action === "prepare") await prepare();
		else if (action === "validate") await validate();
		else if (action === "up") {
			await validate();
			await compose("up", "-d", "--wait", "--wait-timeout", "240");
		} else if (action === "stop") await compose("stop");
		else if (action === "down") await compose("down");
		else if (action === "destroy") {
			assert.equal(
				process.env.NFE_DESTROY_LOCAL,
				"1",
				"Destruction requires NFE_DESTROY_LOCAL=1",
			);
			await compose("down", "--volumes");
		} else
			throw new Error("Use prepare | validate | up | stop | down | destroy");
	} catch {
		process.stderr.write(
			"Local infrastructure command failed; output suppressed to protect secrets.\n",
		);
		process.exitCode = 1;
	}
}
