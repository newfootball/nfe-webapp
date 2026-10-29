import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
	b64,
	bytes,
	command,
	fresh,
	hash,
	identity,
	local,
	privateDir,
	privateWrite,
	protectedRead,
	seal,
	unseal,
} from "./core.mts";
import type { MediaVersion } from "./media.mts";
import {
	assertTopology,
	compose,
	directory,
	networksFor,
	owned,
	save,
	type Topology,
} from "./topology.mts";

export type Archive = {
	format: 1;
	synthetic: true;
	createdAt: string;
	source: string;
	topology: Topology;
	sourceDump: string;
	volumes: Record<string, { content: string; sha256: string }>;
	media: { prefix: string; versions: MediaVersion[] };
	fixture: Record<string, any>;
};
export async function backup(
	project: string,
	media: Archive["media"],
	fixture: Archive["fixture"],
) {
	identity(project);
	assert.ok(project.startsWith("nfe47-source-"));
	const topology = await owned(project);
	// This harness owns the only source SQL writer. Appwrite/proxy/workers are stopped together.
	await compose(
		project,
		"stop",
		"proxy",
		"appwrite",
		"appwrite-worker-databases",
		"appwrite-worker-deletes",
	);
	try {
		const sourceDump = await command([
			"docker",
			"compose",
			"-p",
			project,
			"-f",
			`${directory(project)}/compose.json`,
			"exec",
			"-T",
			"source",
			"pg_dump",
			"-U",
			"synthetic",
			"-d",
			"source",
			"-Fc",
			"--no-owner",
			"--no-acl",
		]);
		await compose(project, "stop");
		const archive: Archive = {
			format: 1,
			synthetic: true,
			createdAt: new Date().toISOString(),
			source: project,
			topology,
			sourceDump: b64(sourceDump),
			volumes: {},
			media,
			fixture,
		};
		for (const name of Object.keys(topology.volumes)) {
			if (name === "source-data") continue; // logical PostgreSQL backup above, restored with pg_restore
			const volume = `${project}_${name}`;
			const [inspection] = JSON.parse(
				(await command(["docker", "volume", "inspect", volume])).toString(),
			);
			assert.equal(inspection.Labels["com.docker.compose.project"], project);
			const content = await command([
				"docker",
				"run",
				"--rm",
				"--network",
				"none",
				"--read-only",
				"--mount",
				`type=volume,source=${volume},target=/data,readonly`,
				"--entrypoint",
				"tar",
				"nginx:1.28.0-alpine",
				"czf",
				"-",
				"-C",
				"/data",
				".",
			]);
			assert.ok(content.byteLength < 128 * 2 ** 20, "synthetic_archive_limit");
			archive.volumes[name] = { content: b64(content), sha256: hash(content) };
		}
		const key = randomBytes(32);
		await privateDir(local);
		const path = `${local}/${project}.nfe47`;
		assert.equal(await Bun.file(path).exists(), false);
		await privateWrite(`${path}.key`, key);
		await privateWrite(path, seal(Buffer.from(JSON.stringify(archive)), key));
		return {
			path,
			sha256: hash(await protectedRead(path)),
			volumeCount: Object.keys(archive.volumes).length,
		};
	} finally {
		// Preserve stopped source on errors; restarting is an explicit later operation.
		await compose(project, "stop");
	}
}
export async function openArchive(path: string): Promise<Archive> {
	const data = unseal(
		await protectedRead(path),
		await protectedRead(`${path}.key`),
	);
	const archive: Archive = JSON.parse(data.toString());
	assert.equal(archive.format, 1);
	assert.equal(archive.synthetic, true);
	assert.ok(identity(archive.source).startsWith("nfe47-source-"));
	assert.equal(archive.topology.name, archive.source);
	assertTopology(archive.topology);
	assert.deepEqual(
		Object.keys(archive.volumes).sort(),
		Object.keys(archive.topology.volumes)
			.filter((v) => v !== "source-data")
			.sort(),
	);
	for (const volume of Object.values(archive.volumes))
		assert.equal(hash(bytes(volume.content)), volume.sha256);
	return archive;
}
export async function restore(
	path: string,
	target: string,
	confirmation: string,
) {
	identity(target);
	assert.ok(target.startsWith("nfe47-restore-"));
	assert.equal(confirmation, target, "explicit_target_confirmation_required");
	const archive = await openArchive(path);
	assert.notEqual(target, archive.source);
	await fresh(target);
	assert.equal(
		await Bun.file(`${directory(target)}/compose.json`).exists(),
		false,
		"target_config_exists",
	);
	const topology = structuredClone(archive.topology);
	topology.name = target;
	topology.networks = networksFor(target);
	topology.services.proxy.ports = ["127.0.0.1:19548:8080"];
	await save(topology);
	// Create labeled volumes/containers without running initialization on the recovered DB.
	await compose(target, "create");
	for (const [name, volume] of Object.entries(archive.volumes)) {
		await command(
			[
				"docker",
				"run",
				"--rm",
				"-i",
				"--network",
				"none",
				"--read-only",
				"--mount",
				`type=volume,source=${target}_${name},target=/data`,
				"--entrypoint",
				"tar",
				"nginx:1.28.0-alpine",
				"xzf",
				"-",
				"-C",
				"/data",
			],
			bytes(volume.content),
		);
	}
	await compose(
		target,
		"up",
		"-d",
		"--wait",
		"--wait-timeout",
		"240",
		"source",
	);
	await command(
		[
			"docker",
			"compose",
			"-p",
			target,
			"-f",
			`${directory(target)}/compose.json`,
			"exec",
			"-T",
			"source",
			"pg_restore",
			"-U",
			"synthetic",
			"-d",
			"source",
			"--no-owner",
			"--no-acl",
			"--exit-on-error",
		],
		bytes(archive.sourceDump),
	);
	await compose(target, "up", "-d", "--wait", "--wait-timeout", "240");
	return archive;
}
