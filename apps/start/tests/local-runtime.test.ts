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
