import { lstat, mkdir, open, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import template from "../local-runtime/compose.template.json";

export const appRoot = resolve(import.meta.dir, "..");
export const state = resolve(appRoot, ".local-runtime");
export const project = "nfe-local-runtime-64";
export const endpoint = "http://127.0.0.1:18464/v1";
export const origin = "http://127.0.0.1:3564";
export const databaseId = "nfe-local";
export const projectId = "nfe-local";
export const hash = (value: string | Uint8Array) =>
	new Bun.CryptoHasher("sha256").update(value).digest("hex");

export async function privateDirectory(path: string) {
	await mkdir(path, { mode: 0o700, recursive: true });
	const info = await lstat(path);
	if (
		!info.isDirectory() ||
		info.isSymbolicLink() ||
		(info.mode & 0o777) !== 0o700
	)
		throw new Error("Private directory must be a real directory with mode0700");
}
export async function readPrivate<T>(path: string): Promise<T> {
	const info = await lstat(path);
	if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600)
		throw new Error("Private file must be a regular file with mode0600");
	return JSON.parse(await Bun.file(path).text()) as T;
}
// Never truncate an existing credential/config, even on a partial/repeated bootstrap.
export async function createPrivate(path: string, value: unknown) {
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
		await file.sync();
	} finally {
		await file.close();
	}
}
export async function loadOrCreate<T>(
	path: string,
	create: () => T,
): Promise<T> {
	try {
		return await readPrivate<T>(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const value = create();
	await createPrivate(path, value);
	return value;
}

export function makeCompose() {
	const env = {
		_APP_ENV: "production",
		_APP_EDITION: "self-hosted",
		_APP_DOMAIN: "localhost",
		_APP_CONSOLE_DOMAIN: "localhost",
		_APP_CONSOLE_HOSTNAMES: "localhost,127.0.0.1",
		_APP_OPTIONS_FORCE_HTTPS: "disabled",
		_APP_OPTIONS_ABUSE: "enabled",
		_APP_OPENSSL_KEY_V1: crypto.randomUUID().replaceAll("-", ""),
		_APP_JOBS_SECRET: crypto.randomUUID().replaceAll("-", ""),
		_APP_DB_ADAPTER: "postgresql",
		_APP_DB_HOST: "postgresql",
		_APP_DB_PORT: "5432",
		_APP_DB_SCHEMA: "appwrite",
		_APP_DB_USER: "local",
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
		// No SMTP worker or SMTP configuration: synthetic accounts only, no mail delivery.
	};
	const services: Record<string, Record<string, unknown>> = structuredClone(
		template.services,
	);
	const volumes = new Set<string>();
	for (const [name, service] of Object.entries(services)) {
		service.networks = ["local"];
		service.restart = "no";
		if (name.startsWith("appwrite") && name !== "appwrite-geo") {
			service.environment = env;
			service.depends_on = [
				"redis",
				"postgresql",
				...(name === "appwrite" ? ["appwrite-geo"] : []),
			];
		}
		if (name === "appwrite-geo")
			service.environment = { GEO_SECRET: env._APP_GEO_SECRET };
		if (name === "postgresql")
			service.environment = {
				POSTGRES_DB: "appwrite",
				POSTGRES_USER: "local",
				POSTGRES_PASSWORD: env._APP_DB_PASS,
			};
		if (name === "appwrite") service.ports = ["127.0.0.1:18464:80"];
		collectVolumes(service, volumes);
	}
	return {
		name: project,
		services,
		networks: { local: {} },
		volumes: Object.fromEntries([...volumes].map((v) => [v, {}])),
	};
}
export async function fileManifest(
	directory: string,
): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	async function visit(relative: string) {
		for (const name of (await readdir(resolve(directory, relative))).sort()) {
			const key = relative ? `${relative}/${name}` : name;
			const path = resolve(directory, key),
				info = await lstat(path);
			if (info.isSymbolicLink())
				throw new Error("Artifact symlinks are forbidden");
			if (info.isDirectory()) await visit(key);
			else if (info.isFile())
				result[key] = hash(new Uint8Array(await Bun.file(path).arrayBuffer()));
			else throw new Error("Unexpected artifact entry");
		}
	}
	await visit("");
	return result;
}

function collectVolumes(
	service: Record<string, unknown>,
	volumes: Set<string>,
) {
	for (const volume of (service.volumes ?? []) as string[]) {
		if (!/^appwrite-[a-z-]+:/.test(volume))
			throw new Error("Unexpected volume binding");
		volumes.add(volume.split(":")[0] as string);
	}
}
