import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { ownedCommand } from "../scripts/local-runtime-command";
import { launchRuntime } from "../scripts/local-runtime-process";
import { privateDirectory } from "../scripts/local-runtime-state";

const directories: string[] = [];
afterEach(async () => {
	for (const path of directories.splice(0))
		await rm(path, { recursive: true, force: true });
});
async function directory() {
	const path = await mkdtemp(resolve(tmpdir(), "nfe-runtime-process-"));
	directories.push(path);
	return path;
}
const active = (pid: number) => {
	try {
		process.kill(pid, 0);
		const status = Bun.spawnSync(["ps", "-p", String(pid), "-o", "stat="], {
			stdout: "pipe",
		})
			.stdout.toString()
			.trim();
		return Boolean(status && !status.startsWith("Z"));
	} catch {
		return false;
	}
};
async function absent(pids: number[]) {
	for (let i = 0; i < 40 && pids.some(active); i++) await Bun.sleep(10);
	expect(pids.some(active)).toBe(false);
}
function inheritedChild(path: string, exitParent = false) {
	return `import {rename} from "node:fs/promises";const child=Bun.spawn([process.execPath,"-e","setInterval(()=>{},1000)"],{stdout:"inherit",stderr:"inherit"});process.on("SIGTERM",async()=>{try{child.kill("SIGTERM")}catch{}await child.exited;process.exit(0)});await Bun.write(${JSON.stringify(`${path}.tmp`)},JSON.stringify([process.pid,child.pid]));await rename(${JSON.stringify(`${path}.tmp`)},${JSON.stringify(path)});${exitParent ? "process.exit(0)" : "setInterval(()=>{},1000)"};`;
}
test("deadline terminates the owned CLI/plugin group and inherited pipes", async () => {
	const root = await directory(),
		file = `${root}/pids.json`;
	const start = performance.now();
	let settled = false;
	const operation = ownedCommand(
		[process.execPath, "-e", inheritedChild(file, true)],
		root,
		{ timeoutMs: 2000 },
	).finally(() => {
		settled = true;
	});
	const observed = operation.catch(() => {});
	try {
		for (let i = 0; i < 100 && !(await Bun.file(file).exists()); i++)
			await Bun.sleep(10);
		expect(await Bun.file(file).exists()).toBe(true);
		const pids: number[] = await Bun.file(file).json();
		expect(pids.length).toBe(2);
		const [parent, child] = pids as [number, number];
		await absent([parent]);
		expect(active(child)).toBe(true);
		// The CLI exited; only its unending descendant keeps the pipes open.
		expect(settled).toBe(false);
		await expect(operation).rejects.toThrow("Owned command");
		expect(performance.now() - start).toBeLessThan(2650);
		await absent(pids);
	} finally {
		await observed;
	}
});
test("startup cancellation reaches the initial Compose inspect and leaves no owned children", async () => {
	const root = await directory(),
		stateDirectory = `${root}/.local-runtime`,
		pids = `${root}/pids.json`;
	await privateDirectory(stateDirectory);
	const docker = `${root}/docker`;
	await Bun.write(docker, `#!${process.execPath}\n${inheritedChild(pids)}`);
	await chmod(docker, 0o700);
	const original = process.env.PATH;
	process.env.PATH = `${root}:${dirname(process.execPath)}:${original ?? ""}`;
	const controller = new AbortController();
	const startup = launchRuntime(root, {}, undefined, {
		signal: controller.signal,
		stateDirectory,
	});
	// Observe the rejection immediately while waiting for the fixture boundary.
	const result = startup.then(
		(runtime) => ({ runtime, error: undefined }),
		(error: unknown) => ({ runtime: undefined, error }),
	);
	try {
		for (let i = 0; i < 100 && !(await Bun.file(pids).exists()); i++)
			await Bun.sleep(10);
		expect(await Bun.file(pids).exists()).toBe(true);
		const startedPids: number[] = await Bun.file(pids).json();
		expect(startedPids.length).toBe(2);
		expect(startedPids.every(active)).toBe(true);
		const start = performance.now();
		controller.abort();
		const outcome = await result;
		expect(outcome.error).toBeInstanceOf(Error);
		expect(String(outcome.error)).toContain("cancelled");
		expect(performance.now() - start).toBeLessThan(650);
		await absent(startedPids);
		expect(await Bun.file(`${stateDirectory}/dependencies.json`).exists()).toBe(
			false,
		);
	} finally {
		controller.abort();
		const outcome = await result;
		if (outcome.runtime) await outcome.runtime.stop();
		process.env.PATH = original;
	}
});
test("foreground app exit tears down its consumer and supervisor polling", async () => {
	const root = await directory(),
		stateDirectory = `${root}/.local-runtime`,
		consumerPid = `${root}/consumer-pid.json`;
	await privateDirectory(stateDirectory);
	await privateDirectory(`${root}/scripts`);
	const services = [
		"appwrite",
		"appwrite-worker-databases",
		"appwrite-worker-deletes",
		"redis",
		"postgresql",
		"appwrite-geo",
	].map((Service) => ({
		Project: "nfe-local-runtime-64",
		Service,
		State: "running",
		Health: "healthy",
	}));
	const docker = `${root}/docker`;
	await Bun.write(
		docker,
		`#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify(services))});`,
	);
	await chmod(docker, 0o700);
	await Bun.write(`${root}/server.ts`, "await Bun.sleep(100);process.exit(0);");
	await Bun.write(
		`${root}/scripts/local-runtime-consumer.ts`,
		`await Bun.write(${JSON.stringify(consumerPid)},JSON.stringify({pid:process.pid,accountKey:process.env.START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY,unrelated:process.env.START_GOOGLE_SECRET}));setInterval(()=>{},1000);`,
	);
	const original = process.env.PATH;
	process.env.PATH = `${root}:${dirname(process.execPath)}:${original ?? ""}`;
	let runtime: Awaited<ReturnType<typeof launchRuntime>> | undefined;
	try {
		runtime = await launchRuntime(
			root,
			{
				START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY: "synthetic-account-key",
				START_GOOGLE_SECRET: "synthetic-unrelated-secret",
			},
			undefined,
			{ stateDirectory },
		);
		for (
			let attempt = 0;
			attempt < 100 && !(await Bun.file(consumerPid).exists());
			attempt++
		)
			await Bun.sleep(10);
		const child = await Bun.file(consumerPid).json();
		expect(child.accountKey).toBe("synthetic-account-key");
		expect(child.unrelated).toBeUndefined();
		expect(await runtime.wait()).toBe(0);
		const result = await runtime.stop();
		expect(result.every((item) => item.ok)).toBe(true);
		await absent([runtime.app.pid, runtime.consumer.pid]);
		expect(await Bun.file(`${stateDirectory}/dependencies.json`).exists()).toBe(
			false,
		);
	} finally {
		if (runtime) await runtime.stop();
		process.env.PATH = original;
	}
});
