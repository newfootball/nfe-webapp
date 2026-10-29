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
		"nfe47-source-1234567890abcdef1234567890abcdef;id",
		"../nfe47-source-1234567890abcdef1234567890abcdef",
		"nfe47-restore-1234567890abcdef1234567890abcdef_extra",
	])
		expect(() => identity(value)).toThrow();
	expect(identity("nfe47-source-1234567890abcdef1234567890abcdef")).toBe(
		"nfe47-source-1234567890abcdef1234567890abcdef",
	);
});
test("media scope requires exact run-owned prefixes", () => {
	for (const value of [
		"",
		"/",
		"nfe-migration-probe/",
		"nfe-backup-47/",
		"nfe-backup-47/source-1234567890abcdef1234567890abcdef/../",
		"nfe-backup-47/source-1234567890abcdef1234567890abcdef",
	])
		expect(() => mediaPrefix(value)).toThrow();
	expect(
		mediaPrefix("nfe-backup-47/restore-1234567890abcdef1234567890abcdef/"),
	).toBe("nfe-backup-47/restore-1234567890abcdef1234567890abcdef/");
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
			"nfe47-restore-1234567890abcdef1234567890abcdef",
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

import type { S3Client } from "@aws-sdk/client-s3";
import { b64, fresh, hash, physicalOwned } from "./core.mts";
import {
	emptyPrefixes,
	eraseMedia,
	journalFor,
	recoverMedia,
	seedMedia,
} from "./media.mts";

const sourcePrefix = `nfe-backup-47/source-${"a".repeat(32)}/`;
const targetPrefix = `nfe-backup-47/restore-${"a".repeat(32)}/`;
function fakeS3(initial: any[] = []) {
	const versions = structuredClone(initial);
	const calls: any[] = [];
	let serial = 0;
	const client = {
		async send(command: any) {
			const op = command.constructor.name;
			const input = command.input;
			calls.push({ op, input });
			if (op === "ListObjectVersionsCommand") {
				const selected = versions.filter((v) => v.Key.startsWith(input.Prefix));
				return {
					Versions: selected.filter((v) => !v.deleted),
					DeleteMarkers: selected.filter((v) => v.deleted),
				};
			}
			if (op === "GetObjectCommand") {
				const item = versions.find(
					(v) =>
						v.Key === input.Key &&
						(input.VersionId ? v.VersionId === input.VersionId : v.IsLatest),
				);
				if (!item || item.deleted) throw new Error("NoSuchKey");
				return {
					Body: { transformToByteArray: async () => Buffer.from(item.content) },
				};
			}
			if (op === "DeleteObjectCommand" && input.VersionId) {
				const index = versions.findIndex(
					(v) => v.Key === input.Key && v.VersionId === input.VersionId,
				);
				if (index >= 0) versions.splice(index, 1);
				return {};
			}
			for (const v of versions.filter((v) => v.Key === input.Key))
				v.IsLatest = false;
			const VersionId = `created-${++serial}`;
			versions.push({
				Key: input.Key,
				VersionId,
				IsLatest: true,
				LastModified: new Date(0),
				deleted: op === "DeleteObjectCommand",
				content: input.Body,
			});
			return { VersionId };
		},
	} as unknown as S3Client;
	return { client, versions, calls };
}
test("both occupied prefixes fail before seeding and empty journals never delete even on prepare failure", async () => {
	for (const prefix of [sourcePrefix, targetPrefix]) {
		const fake = fakeS3([
			{
				Key: `${prefix}overwritten.bin`,
				VersionId: "foreign",
				LastModified: new Date(0),
				IsLatest: true,
			},
		]);
		const journal = journalFor(sourcePrefix);
		await expect(
			emptyPrefixes(fake.client, [sourcePrefix, targetPrefix]),
		).rejects.toThrow("media_prefix_occupied");
		if (prefix === sourcePrefix)
			await expect(seedMedia(fake.client, journal)).rejects.toThrow();
		await eraseMedia(fake.client, journal);
		expect(fake.calls.every((c) => c.op === "ListObjectVersionsCommand")).toBe(
			true,
		);
		expect(fake.versions[0].VersionId).toBe("foreign");
	}
});
test("cleanup only deletes API-receipt versions including tombstones, retaining concurrent foreign version", async () => {
	const fake = fakeS3();
	const journal = journalFor(sourcePrefix);
	await seedMedia(fake.client, journal);
	expect(journal.created).toHaveLength(4);
	fake.versions.push({
		Key: `${sourcePrefix}overwritten.bin`,
		VersionId: "foreign",
	});
	const before = fake.calls.length;
	await eraseMedia(fake.client, journal);
	expect(fake.versions.map((v) => v.VersionId)).toEqual(["foreign"]);
	expect(
		fake.calls
			.slice(before)
			.every(
				(c) =>
					c.op === "DeleteObjectCommand" &&
					c.input.VersionId.startsWith("created-"),
			),
	).toBe(true);
});
test("restore replays explicit latest last on tied timestamps and preserves historical/current tombstones", async () => {
	const fake = fakeS3();
	const item = (
		name: string,
		versionId: string,
		latest: boolean,
		deleted: boolean,
		content: string,
	) => ({
		key: `${sourcePrefix}${name}.bin`,
		versionId,
		latest,
		deleted,
		modified: new Date(0).toISOString(),
		...(deleted
			? {}
			: { content: b64(Buffer.from(content)), sha256: hash(content) }),
	});
	const input = [
		item("overwritten", "new", true, false, "new"),
		item("overwritten", "old", false, false, "old"),
		item("overwritten", "historical-delete", false, true, ""),
		item("deleted", "delete", true, true, ""),
		item("deleted", "original", false, false, "original"),
	];
	await recoverMedia(
		fake.client,
		sourcePrefix,
		targetPrefix,
		input,
		journalFor(targetPrefix),
	);
	expect(
		fake.versions
			.find((v) => v.Key.endsWith("overwritten.bin") && v.IsLatest)
			?.content.toString(),
	).toBe("new");
	expect(
		fake.versions.find((v) => v.Key.endsWith("deleted.bin") && v.IsLatest)
			?.deleted,
	).toBe(true);
	expect(fake.versions).toHaveLength(5);
});
test("physical target names refuse unlabelled or foreign resources before creation and postcreation checks ownership", async () => {
	const project = `nfe47-restore-${"a".repeat(32)}`;
	const names = {
		container: [`${project}-source-1`],
		volume: [`${project}_source-data`],
		network: [`${project}_private`],
	};
	for (const kind of ["container", "volume", "network"] as const) {
		await expect(
			fresh(project, names, async (args) =>
				Buffer.from(args[1] === kind ? names[kind][0]! : ""),
			),
		).rejects.toThrow("target_physical_name_occupied");
	}
	await expect(
		fresh(project, names, async () => Buffer.from("")),
	).resolves.toBeUndefined();
	for (const labels of [{}, { "com.docker.compose.project": "foreign" }])
		await expect(
			physicalOwned(project, names, async () =>
				Buffer.from(
					JSON.stringify([
						{ Name: names.container[0], Config: { Labels: labels } },
					]),
				),
			),
		).rejects.toThrow("resource_ownership_mismatch");
});

test("console bootstrap supplies required explicit key ID without exposing credentials", async () => {
	const { bootstrap } = await import("./appwrite.mts");
	const original = globalThis.fetch;
	const paths: string[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		options: RequestInit,
	) => {
		const path = new URL(String(url)).pathname;
		paths.push(path);
		if (path.endsWith("/keys")) {
			const body = JSON.parse(options.body as string);
			if (body.keyId !== "backup-key")
				return Response.json(
					{ type: "general_argument_invalid" },
					{ status: 400 },
				);
			return Response.json({ secret: "synthetic-disposable-key" });
		}
		return Response.json({ $id: "synthetic" });
	}) as typeof fetch;
	try {
		const credentials = await bootstrap("http://127.0.0.1:19547/v1");
		expect(credentials.project).toBe("backup-proof");
		expect(credentials.key).toBe("synthetic-disposable-key");
		expect(paths).toHaveLength(5);
	} finally {
		globalThis.fetch = original;
	}
});
