import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
	createPrivate,
	fileManifest,
	loadOrCreate,
	makeCompose,
	privateDirectory,
	readPrivate,
} from "../scripts/local-runtime-state";

const directories: string[] = [];
async function temporary() {
	const directory = await mkdtemp(resolve(tmpdir(), "nfe-local-unit-"));
	directories.push(directory);
	return directory;
}
afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});
test("repeat prepare preserves bytes and credentials instead of generating replacements", async () => {
	const directory = await temporary();
	await privateDirectory(directory);
	const file = `${directory}/compose.json`;
	await loadOrCreate(file, makeCompose);
	const before = await readFile(file);
	await loadOrCreate(file, () => {
		throw new Error("must not regenerate");
	});
	expect(await readFile(file)).toEqual(before);
	await expect(createPrivate(file, { replaced: true })).rejects.toThrow();
	expect(await readFile(file)).toEqual(before);
});
test("private state refuses symlinks and permissive existing files/directories", async () => {
	const directory = await temporary(),
		path = `${directory}/secret.json`;
	await createPrivate(path, { secret: "unit-synthetic" });
	await symlink(path, `${directory}/alias.json`);
	await expect(readPrivate(`${directory}/alias.json`)).rejects.toThrow();
	await chmod(path, 0o644);
	await expect(readPrivate(path)).rejects.toThrow();
	await chmod(directory, 0o755);
	await expect(privateDirectory(directory)).rejects.toThrow();
});
test("persistent compose exposes only isolated Appwrite loopback; no host binds or fixed subnet", () => {
	const compose = makeCompose();
	expect(compose.name).toBe("nfe-local-runtime-64");
	expect(compose.services.appwrite?.image).toBe("appwrite/appwrite:2.6.2");
	expect(compose.services.appwrite?.ports).toEqual(["127.0.0.1:18464:80"]);
	expect(compose.networks).toEqual({ local: {} });
	for (const [name, service] of Object.entries(compose.services)) {
		if (name !== "appwrite") expect(service.ports).toBeUndefined();
		expect(service.container_name).toBeUndefined();
		for (const volume of (service.volumes ?? []) as string[])
			expect(volume).toMatch(/^appwrite-[a-z-]+:/);
	}
	expect(Object.keys(compose.volumes)).toContain("appwrite-postgresql");
	expect(JSON.stringify(compose)).not.toContain("SMTP_HOST");
});
test("release identity is stable across enumeration order and detects modified content", async () => {
	const directory = await temporary();
	await createPrivate(`${directory}/b.json`, { data: 2 });
	await createPrivate(`${directory}/a.json`, { data: 1 });
	const first = await fileManifest(directory);
	expect(Object.keys(first)).toEqual(["a.json", "b.json"]);
	expect(await fileManifest(directory)).toEqual(first);
	await Bun.write(`${directory}/a.json`, "changed");
	expect(await fileManifest(directory)).not.toEqual(first);
	await symlink(`${directory}/b.json`, `${directory}/link`);
	await expect(fileManifest(directory)).rejects.toThrow();
});

test("cleanup attempts all owned resources despite a rejected or stalled action", async () => {
	const { cleanupAll } = await import("../scripts/local-runtime-cleanup");
	const attempted: string[] = [];
	const results = await cleanupAll([
		{
			name: "browser",
			timeoutMs: 30,
			run: async () => {
				attempted.push("browser");
				throw new Error("transport closed");
			},
		},
		{
			name: "session",
			timeoutMs: 10,
			run: async (signal) => {
				attempted.push("session");
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve()),
				);
			},
		},
		{
			name: "app",
			timeoutMs: 30,
			run: async () => {
				attempted.push("app");
			},
		},
		{
			name: "backend",
			timeoutMs: 30,
			run: async () => {
				attempted.push("backend");
			},
		},
	]);
	expect(attempted.sort()).toEqual(["app", "backend", "browser", "session"]);
	expect(results).toEqual([
		{ name: "browser", ok: false, error: "failed" },
		{ name: "session", ok: false, error: "timeout" },
		{ name: "app", ok: true },
		{ name: "backend", ok: true },
	]);
});

test("readiness report rejects stale, future, wrong namespace, duplicate and unavailable services", async () => {
	const { reportReady, requiredServices } = await import(
		"../scripts/local-runtime-dependencies"
	);
	const nonce = "3d253642-5bc7-4154-94ca-1518300ee984";
	const valid = {
		format: 1,
		project: "nfe-local-runtime-64",
		endpoint: "http://127.0.0.1:18464/v1",
		origin: "http://127.0.0.1:3564",
		nonce,
		checkedAt: 100_000,
		services: requiredServices.map((name) => ({
			name,
			running: true,
			healthy: true,
		})),
	};
	expect(reportReady(valid, nonce, 100_000)).toBe(true);
	expect(reportReady(valid, nonce, 111_000)).toBe(false);
	expect(reportReady(valid, nonce, 99_999)).toBe(false);
	expect(
		reportReady({ ...valid, project: "some-other-project" }, nonce, 100_000),
	).toBe(false);
	expect(reportReady(valid, crypto.randomUUID(), 100_000)).toBe(false);
	expect(reportReady({ ...valid, extra: true }, nonce, 100_000)).toBe(false);
	for (const name of requiredServices)
		expect(
			reportReady(
				{
					...valid,
					services: valid.services.map((service) =>
						service.name === name ? { ...service, running: false } : service,
					),
				},
				nonce,
				100_000,
			),
		).toBe(false);
	expect(
		reportReady(
			{ ...valid, services: valid.services.map(() => valid.services[0]) },
			nonce,
			100_000,
		),
	).toBe(false);
});

test("readiness uses bounded server-only DB/cache/geo checks and fails closed", async () => {
	const { localHealth } = await import("../scripts/local-runtime-health");
	const { requiredServices } = await import(
		"../scripts/local-runtime-dependencies"
	);
	const { spyOn } = await import("bun:test");
	const directory = `${await temporary()}/.local-runtime`;
	await privateDirectory(directory);
	const nonce = crypto.randomUUID();
	await createPrivate(`${directory}/dependencies.json`, {
		format: 1,
		project: "nfe-local-runtime-64",
		endpoint: "http://127.0.0.1:18464/v1",
		origin: "http://127.0.0.1:3564",
		nonce,
		checkedAt: Date.now(),
		services: requiredServices.map((name) => ({
			name,
			running: true,
			healthy: true,
		})),
	});
	const env = { ...process.env };
	Object.assign(process.env, {
		START_LOCAL_RUNTIME: "1",
		START_APPWRITE_ENDPOINT: "http://127.0.0.1:18464/v1",
		START_APPWRITE_PROJECT: "nfe-local",
		START_APPWRITE_DATABASE: "nfe-local",
		START_LOCAL_HEALTH_KEY: "synthetic-health",
		START_APPWRITE_FEED_READER_KEY: "synthetic-reader",
		START_LOCAL_SUPERVISOR_DIRECTORY: directory,
		START_LOCAL_SUPERVISOR_NONCE: nonce,
	});
	let failedPath = "";
	const calls: string[] = [];
	const implementation = Object.assign(
		async (
			input: Parameters<typeof globalThis.fetch>[0],
			options?: Parameters<typeof globalThis.fetch>[1],
		) => {
			const path = new URL(String(input)).pathname;
			calls.push(path);
			expect(options?.signal).toBeInstanceOf(AbortSignal);
			if (path === failedPath)
				return Response.json({ private: "not published" }, { status: 503 });
			if (path.endsWith("/version")) return Response.json({ version: "2.6.2" });
			if (path.endsWith("/geo")) return Response.json({ status: "pass" });
			if (path.endsWith("/db") || path.endsWith("/cache"))
				return Response.json({ total: 1, statuses: [{ status: "pass" }] });
			return Response.json({ digest: "synthetic-marker" });
		},
		{ preconnect: globalThis.fetch.preconnect },
	);
	const fetch = spyOn(globalThis, "fetch").mockImplementation(implementation);
	try {
		expect((await localHealth("/_local/ready", false))?.status).toBe(200);
		for (const path of [
			"/v1/health/db",
			"/v1/health/cache",
			"/v1/health/geo",
		]) {
			failedPath = path;
			const response = await localHealth("/_local/ready", false);
			expect(response?.status).toBe(503);
			expect(await response?.text()).not.toContain("private");
		}
		expect(calls).toContain("/v1/health/geo");
	} finally {
		fetch.mockRestore();
		process.env = env;
	}
});
