import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { identity, seal, unseal } from "./core.mts";
import { mediaPrefix } from "./media.mts";

test("archive decrypts exactly and hides database/password sentinel", () => {
	const key = randomBytes(32);
	const plaintext = Buffer.from("protected-secret-and-synthetic-database");
	const archive = seal(plaintext, key);
	expect(archive.includes(plaintext)).toBe(false);
	expect(unseal(archive, key)).toEqual(plaintext);
});
test("wrong key, ciphertext modification, header corruption and truncation fail authentication", () => {
	const key = randomBytes(32);
	const archive = seal(Buffer.from("sensitive"), key);
	expect(() => unseal(archive, randomBytes(32))).toThrow();
	const corrupted = Buffer.from(archive);
	corrupted[corrupted.length - 1] ^= 1;
	expect(() => unseal(corrupted, key)).toThrow();
	expect(() => unseal(archive.subarray(0, 20), key)).toThrow();
	const header = Buffer.from(archive);
	header[0] = 0;
	expect(() => unseal(header, key)).toThrow();
});
test("identities reject production, other tasks, shell payloads and traversal", () => {
	for (const value of [
		"nfe-production",
		"nfe46-local",
		"nfe47-source-12345678;id",
		"../nfe47-source-12345678",
		"nfe47-restore-12345678_extra",
	])
		expect(() => identity(value)).toThrow();
	expect(identity("nfe47-source-12345678")).toBe("nfe47-source-12345678");
});
test("media scope requires exact run-owned prefixes", () => {
	for (const value of [
		"",
		"/",
		"nfe-migration-probe/",
		"nfe-backup-47/",
		"nfe-backup-47/source-12345678/../",
		"nfe-backup-47/source-12345678",
	])
		expect(() => mediaPrefix(value)).toThrow();
	expect(mediaPrefix("nfe-backup-47/restore-12345678/")).toBe(
		"nfe-backup-47/restore-12345678/",
	);
});
test("CLI and proof default to dry-run even with inaccessible credential path", async () => {
	for (const entry of ["cli.mts", "proof.mts"]) {
		const child = Bun.spawn([
			"bun",
			"run",
			`${import.meta.dir}/${entry}`,
			"--b2-env",
			"/nonexistent/secret",
		]);
		const out = await new Response(child.stdout).text();
		expect(await child.exited).toBe(0);
		expect(out).toContain("dry_run");
	}
});
test("restore refuses missing explicit confirmation before accessing archive or Docker", async () => {
	const child = Bun.spawn(
		[
			"bun",
			"run",
			`${import.meta.dir}/cli.mts`,
			"--run",
			"--action",
			"restore",
			"--target",
			"nfe47-restore-12345678",
			"--archive",
			"/nonexistent/sensitive",
		],
		{ stderr: "pipe" },
	);
	const err = await new Response(child.stderr).text();
	expect(await child.exited).toBe(1);
	expect(err).toContain("details suppressed");
	expect(err).not.toContain("sensitive");
});
