import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, stat } from "node:fs/promises";

export const root = import.meta.dir;
export const local = `${root}/.local`;
export const hash = (data: string | Uint8Array) =>
	new Bun.CryptoHasher("sha256").update(data).digest("hex");
export function identity(project: string) {
	assert.match(project, /^nfe47-(source|restore)-[a-f0-9]{8}$/);
	return project;
}
export async function privateWrite(path: string, data: string | Uint8Array) {
	await Bun.write(path, data, { mode: 0o600 });
	await chmod(path, 0o600);
}
export async function privateDir(path: string) {
	await mkdir(path, { recursive: true, mode: 0o700 });
	await chmod(path, 0o700);
}
export async function protectedRead(path: string) {
	assert.equal((await stat(path)).mode & 0o777, 0o600);
	return readFile(path);
}
// AES-GCM authenticates the entire archive before any Docker mutation or extraction.
export function seal(data: Uint8Array, key: Uint8Array) {
	assert.equal(key.byteLength, 32);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(Buffer.from("NFE47-v1"));
	const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
	return Buffer.concat([
		Buffer.from("NFE47-v1"),
		iv,
		cipher.getAuthTag(),
		ciphertext,
	]);
}
export function unseal(data: Uint8Array, key: Uint8Array) {
	assert.equal(Buffer.from(data.slice(0, 8)).toString(), "NFE47-v1");
	assert.equal(key.byteLength, 32);
	const decipher = createDecipheriv("aes-256-gcm", key, data.slice(8, 20));
	decipher.setAAD(Buffer.from("NFE47-v1"));
	decipher.setAuthTag(data.slice(20, 36));
	return Buffer.concat([decipher.update(data.slice(36)), decipher.final()]);
}
// Never return stderr, SQL or a rendered configuration to the caller's logs.
export async function command(args: string[], input?: Uint8Array | string) {
	const child = Bun.spawn(args, {
		stdin:
			input === undefined
				? "ignore"
				: new Blob([typeof input === "string" ? input : new Uint8Array(input)]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, , code] = await Promise.all([
		new Response(child.stdout).arrayBuffer(),
		new Response(child.stderr).arrayBuffer(),
		child.exited,
	]);
	assert.equal(code, 0, "protected_command_failed");
	return Buffer.from(out);
}
export async function resources(project: string) {
	identity(project);
	const found = [];
	for (const kind of ["container", "volume", "network"])
		found.push(
			(
				await command([
					"docker",
					kind,
					"ls",
					"-q",
					"--filter",
					`label=com.docker.compose.project=${project}`,
				])
			)
				.toString()
				.trim(),
		);
	return found.some(Boolean);
}
export async function fresh(project: string) {
	assert.equal(await resources(project), false, "target_not_empty");
}
export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
export const bytes = (value: string) => Buffer.from(value, "base64");
