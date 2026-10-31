import assert from "node:assert/strict";
import {
	chmod,
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	rename,
	rm,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import {
	bootstrap,
	configure,
	provisionLocal,
} from "./local-runtime-bootstrap";
import {
	appRoot,
	createPrivate,
	endpoint,
	fileManifest,
	hash,
	loadOrCreate,
	makeCompose,
	origin,
	privateDirectory,
	project,
	readPrivate,
	state,
} from "./local-runtime-state";

export async function command(
	args: string[],
	cwd = appRoot,
	options: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
	if (options.signal?.aborted) throw new Error("Command cancelled");
	const child = Bun.spawn(args, {
		cwd,
		env: { ...process.env, NODE_ENV: "production" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const stop = () => child.kill("SIGKILL");
	const timeout = setTimeout(stop, options.timeoutMs ?? 240_000);
	options.signal?.addEventListener("abort", stop, { once: true });
	const [out, , code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timeout);
	options.signal?.removeEventListener("abort", stop);
	// Child/API diagnostics can contain secrets; never echo raw stderr or config.
	if (code)
		throw new Error(
			`${args.slice(0, 2).join(" ")} failed (exit${code}); private diagnostics require local inspection`,
		);
	return out;
}
export const composeArgs = [
	"docker",
	"compose",
	"--project-name",
	project,
	"--file",
	`${state}/compose.json`,
];
export async function assertFreePort(port: number) {
	await new Promise<void>((resolvePromise, reject) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		socket.once("connect", () => {
			socket.destroy();
			reject(new Error(`Port${port} is occupied`));
		});
		socket.once("error", (error: NodeJS.ErrnoException) => {
			socket.destroy();
			error.code === "ECONNREFUSED" ? resolvePromise() : reject(error);
		});
		socket.setTimeout(1500, () => {
			socket.destroy();
			reject(new Error("Port inspection timed out"));
		});
	});
}
async function prepare() {
	const file = `${state}/compose.json`;
	if (await Bun.file(file).exists()) {
		const saved = await readPrivate<ReturnType<typeof makeCompose>>(file);
		assert.equal(saved.name, project);
		assert.deepEqual(saved.services.appwrite?.ports, ["127.0.0.1:18464:80"]);
		return;
	}
	for (const args of [
		["ps", "-aq"],
		["volume", "ls", "-q"],
		["network", "ls", "-q"],
	]) {
		const existing = await command([
			"docker",
			...args,
			"--filter",
			`label=com.docker.compose.project=${project}`,
		]);
		assert.equal(
			existing.trim(),
			"",
			"Unclaimed local runtime resources exist; refusing reuse",
		);
	}
	await assertFreePort(18464);
	await assertFreePort(3564);
	const info = JSON.parse(
		await command(["docker", "info", "--format", "{{json .}}"]),
	);
	assert.ok(
		info.NCPU >= 2 && info.MemTotal >= 8 * 1024 ** 3,
		"Docker needs >=2CPU and >=8GiB",
	);
	await loadOrCreate(file, makeCompose);
}
export async function checkBackend() {
	const response = await fetch(`${endpoint}/health/version`, {
		signal: AbortSignal.timeout(3000),
	});
	assert.ok(response.ok);
	assert.equal(
		((await response.json()) as { version: string }).version,
		"2.6.2",
	);
}
async function restrictTree(directory: string) {
	await chmod(directory, 0o700);
	for (const name of await readdir(directory)) {
		const path = resolve(directory, name),
			info = await lstat(path);
		if (info.isSymbolicLink()) throw new Error("Unexpected release symlink");
		if (info.isDirectory()) await restrictTree(path);
		else await chmod(path, 0o600);
	}
}
export async function release() {
	assert.equal(Bun.version, "1.3.14", "Use pinned Bun1.3.14");
	const releases = `${state}/releases`;
	await privateDirectory(releases);
	const directory = await mkdtemp(`${releases}/building-`);
	try {
		const result = await Bun.build({
			entrypoints: [`${appRoot}/server.ts`],
			target: "bun",
			outdir: directory,
			naming: "app.js",
			sourcemap: "none",
			minify: false,
		});
		if (!result.success) throw new Error("Local artifact bundling failed");
		await mkdir(`${directory}/dist`, { mode: 0o700 });
		await cp(`${appRoot}/dist/client`, `${directory}/dist/client`, {
			recursive: true,
			errorOnExist: true,
		});
		const files = await fileManifest(directory);
		const manifest = { format: 1, bun: "1.3.14", node: "24", files };
		const digest = hash(JSON.stringify(manifest));
		await createPrivate(`${directory}/manifest.json`, manifest);
		await restrictTree(directory);
		const target = `${releases}/${digest}`;
		if (await Bun.file(`${target}/manifest.json`).exists()) {
			assert.deepEqual(
				await readPrivate(`${target}/manifest.json`),
				manifest,
				"Release manifest drift",
			);
			await rm(directory, { recursive: true });
		} else await rename(directory, target);
		return { digest, directory: target };
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
}
export async function verifyRelease(digest: string) {
	assert.match(digest, /^[a-f0-9]{64}$/);
	const directory = `${state}/releases/${digest}`;
	const manifest = await readPrivate<{
		format: number;
		bun: string;
		node: string;
		files: Record<string, string>;
	}>(`${directory}/manifest.json`);
	assert.equal(
		hash(JSON.stringify(manifest)),
		digest,
		"Artifact identity differs",
	);
	assert.equal(manifest.bun, Bun.version, "Artifact runtime differs");
	const actual = Object.fromEntries(
		Object.entries(await fileManifest(directory)).filter(
			([path]) => path !== "manifest.json",
		),
	);
	assert.deepEqual(actual, manifest.files, "Artifact contents differ");
	return directory;
}
export async function runtimeConfig() {
	const env = await readPrivate<Record<string, string>>(
		`${state}/runtime.json`,
	);
	assert.equal(env.START_APPWRITE_ENDPOINT, endpoint);
	assert.equal(env.START_APP_ORIGIN, origin);
	assert.equal(env.PORT, "3564");
	assert.equal(env.START_LOCAL_RUNTIME, "1");
	assert.ok(
		!Object.keys(env).some(
			(key) =>
				key.startsWith("VITE_") ||
				key.startsWith("B2_") ||
				key.startsWith("START_GOOGLE"),
		),
		"Local config contains unsupported integrations",
	);
	return env;
}
export async function main(action: string | undefined, digest?: string) {
	assert.equal(Bun.version, "1.3.14", "Use Bun1.3.14");
	await privateDirectory(state);
	if (action === "prepare") await prepare();
	else if (action === "up") {
		await readPrivate(`${state}/compose.json`);
		await command([
			...composeArgs,
			"up",
			"-d",
			"--wait",
			"--wait-timeout",
			"180",
			"--pull",
			"never",
		]);
		await checkBackend();
	} else if (action === "stop") {
		await readPrivate(`${state}/compose.json`);
		await command([...composeArgs, "stop", "--timeout", "30"]);
	} else if (action === "provision") {
		await checkBackend();
		await readPrivate(`${state}/compose.json`);
		const credentials = await bootstrap();
		await provisionLocal(credentials);
		await configure(credentials);
	} else if (action === "release") {
		const result = await release();
		process.stdout.write(`${result.digest}\n`);
		return;
	} else if (action === "start") {
		assert.ok(digest, "Pass an immutable release digest");
		const directory = await verifyRelease(digest);
		await assertFreePort(3564);
		const env = await runtimeConfig();
		const { superviseDependencies } = await import(
			"./local-runtime-supervisor"
		);
		const supervisor = await superviseDependencies();
		let server: ReturnType<typeof Bun.spawn> | undefined;
		let stop: (() => void) | undefined;
		try {
			server = Bun.spawn([process.execPath, `${directory}/app.js`], {
				cwd: directory,
				env: { ...env, ...supervisor.env, PATH: process.env.PATH },
				stdout: "ignore",
				stderr: "ignore",
			});
			const owned = server;
			const { stopOwnedProcess } = await import("./local-runtime-cleanup");
			stop = () => {
				void stopOwnedProcess(owned).catch(() => {});
			};
			process.once("SIGINT", stop);
			process.once("SIGTERM", stop);
			process.stdout.write(
				`Local runtime at ${origin}; Ctrl-C gracefully stops the app.\n`,
			);
			const code = await server.exited;
			if (code) throw new Error(`Local app exited (${code})`);
		} finally {
			if (stop) {
				process.off("SIGINT", stop);
				process.off("SIGTERM", stop);
			}
			await supervisor.stop();
		}
	} else if (action === "status") {
		const check = async (url: string) => {
			try {
				return (await fetch(url, { signal: AbortSignal.timeout(4000) })).status;
			} catch {
				return "unreachable";
			}
		};
		process.stdout.write(
			`${JSON.stringify({ backend: await check(`${endpoint}/health/version`), live: await check(`${origin}/_local/health`), ready: await check(`${origin}/_local/ready`) })}\n`,
		);
		return;
	} else
		throw new Error(
			"Use prepare | up | provision | release | start <digest> | stop | status",
		);
	process.stdout.write(
		`Local runtime ${action}: complete (persistent state retained).\n`,
	);
}
if (import.meta.main) {
	try {
		await main(Bun.argv[2], Bun.argv[3]);
	} catch {
		process.stderr.write(
			"Local runtime command failed; see runbook diagnostics (no secrets printed).\n",
		);
		process.exitCode = 1;
	}
}
