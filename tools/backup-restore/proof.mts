import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compare } from "bcryptjs";
import {
	bootstrap,
	contract,
	contractSha,
	seed,
	snapshot,
	verify,
} from "./appwrite.mts";
import { backup } from "./archive.mts";
import { b64, privateDir, privateWrite } from "./core.mts";
import {
	emptyPrefixes,
	eraseMedia,
	inventory,
	journalFor,
	mediaClient,
	seedMedia,
	snapshotMedia,
} from "./media.mts";
import { recover } from "./recovery.mts";
import {
	destroy,
	directory,
	generate,
	save,
	sql,
	start,
	upstream,
} from "./topology.mts";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	strict: true,
	options: {
		run: { type: "boolean" },
		"confirm-isolated": { type: "boolean" },
		"schema-checkout": { type: "string" },
		"b2-env": { type: "string" },
	},
});
if (!values.run) {
	console.log(
		"dry_run: no credentials read or external mutations; --run --confirm-isolated --schema-checkout PATH --b2-env PATH required",
	);
	process.exit(0);
}
assert.ok(
	values["confirm-isolated"] && values["schema-checkout"] && values["b2-env"],
);
const id = crypto.randomUUID().replaceAll("-", "");
const source = `nfe47-source-${id}`;
const target = `nfe47-restore-${id}`;
const prefix = `nfe-backup-47/source-${id}/`;
const targetPrefix = `nfe-backup-47/restore-${id}/`;
const report: Record<string, any> = {
	generatedAt: new Date().toISOString(),
	status: "running",
	syntheticOnly: true,
	contract: {
		sha: contractSha,
		acceptedFor: "local experiment only; unmerged snapshot",
	},
	upstream,
	projects: { source, target },
	checks: {},
	timingsMs: {},
	externalGates: [
		"permanent infrastructure #46",
		"authorized actual-source recovery",
		"encrypted off-host custody and independent key escrow",
		"owner-approved RPO/RTO/retention and trigger",
		"renew if merged schema differs",
	],
};
const sourceJournal = journalFor(prefix);
const targetJournal = journalFor(targetPrefix);
let stage = "prepare";
let b2: Awaited<ReturnType<typeof mediaClient>> | undefined;
let prepared = false;
let restored = false;
const started = performance.now();
try {
	const c = await contract(values["schema-checkout"]!);
	report.contract.files = c.files;
	b2 = await mediaClient(values["b2-env"]!);
	await emptyPrefixes(b2, [prefix, targetPrefix]);
	const topology = await generate(source, 19547);
	await save(topology);
	prepared = true;
	await start(source);
	assert.equal(
		(await (await fetch("http://127.0.0.1:19547/v1/health/version")).json())
			.version,
		"2.6.2",
	);
	stage = "fixtures";
	const credentials = await bootstrap("http://127.0.0.1:19547/v1");
	const media = await seedMedia(b2, sourceJournal);
	await seed("http://127.0.0.1:19547/v1", credentials, c, media);
	await sql(
		source,
		`CREATE TABLE users(id text PRIMARY KEY, password text NOT NULL); CREATE TABLE posts(id text PRIMARY KEY, user_id text REFERENCES users(id)); CREATE TABLE media(id text PRIMARY KEY, post_id text REFERENCES posts(id), filename text NOT NULL); INSERT INTO users VALUES ('a','${credentials.hash}'),('b','${credentials.hash}'),('admin','${credentials.hash}'); INSERT INTO posts VALUES ('post','a'); INSERT INTO media VALUES ('overwritten','post','overwritten.bin'),('deleted','post','deleted.bin');`,
	);
	await privateDir(`${directory(source)}/media`);
	const sourceMedia: Record<string, string> = {};
	for (const name of ["overwritten.bin", "deleted.bin"]) {
		await privateWrite(
			`${directory(source)}/media/${name}`,
			Buffer.from(`Independent synthetic source media ${name} ${id}`),
		);
		sourceMedia[name] = b64(
			await Bun.file(`${directory(source)}/media/${name}`).bytes(),
		);
	}
	const sourceCounts = (
		await sql(
			source,
			"SELECT json_build_object('users',(SELECT count(*) FROM users),'posts',(SELECT count(*) FROM posts),'media',(SELECT count(*) FROM media));",
		)
	)
		.toString()
		.trim();
	const before = await snapshot("http://127.0.0.1:19547/v1", credentials, c);
	report.checks.before = await verify(
		"http://127.0.0.1:19547/v1",
		credentials,
		c,
	);
	stage = "backup";
	const backupStarted = performance.now();
	const versions = await snapshotMedia(b2, prefix);
	assert.equal(versions.filter((v) => !v.deleted).length, 3);
	assert.equal(versions.filter((v) => v.deleted).length, 1);
	const archive = await backup(
		source,
		{ prefix, versions },
		{ credentials, media, sourceMedia, snapshot: before },
	);
	report.timingsMs.backup = Math.round(performance.now() - backupStarted);
	report.archive = {
		sha256: archive.sha256,
		volumeCount: archive.volumeCount,
		permissions: (await stat(archive.path)).mode & 0o777,
		encryption: "AES-256-GCM; independent random 256-bit local key",
	};
	assert.equal(report.archive.permissions, 0o600);
	stage = "simulate_loss";
	await eraseMedia(b2, sourceJournal);
	assert.equal((await inventory(b2, prefix)).length, 0);
	await destroy(source);
	prepared = false;
	await rm(directory(source), { recursive: true });
	report.checks.sourceDestroyedBeforeRecovery = true;
	stage = "restore";
	// Set before attempting restore so partial target resources are cleaned on failure.
	restored = true;
	const recovery = await recover(
		archive.path,
		target,
		target,
		values["b2-env"]!,
		targetJournal,
	);
	report.timingsMs.coldVolumesAndPostgresRestore = recovery.volumesRestoredMs;
	report.timingsMs.fullRestoreIncludingMediaAndReconciliation =
		recovery.totalRestoreMs;
	report.checks.allRowsAndAclByteReconciledBeforeMediaRemap = true;
	report.checks.after = await verify(
		"http://127.0.0.1:19548/v1",
		credentials,
		c,
	);
	const after = await snapshot("http://127.0.0.1:19548/v1", credentials, c);
	assert.deepEqual(after.counts, before.counts);
	for (const table of Object.keys(before.digests))
		if (table !== "media")
			assert.equal(after.digests[table], before.digests[table]);
	report.counts = {
		sourcePostgres: JSON.parse(sourceCounts),
		appwrite: after.counts,
		authUsers: after.users,
		mediaVersionsCopied: Object.keys(recovery.mapping).length,
		deleteMarkers: versions.filter((v) => v.deleted).length,
	};
	assert.equal(
		(
			await sql(
				target,
				"SELECT json_build_object('users',(SELECT count(*) FROM users),'posts',(SELECT count(*) FROM posts),'media',(SELECT count(*) FROM media));",
			)
		)
			.toString()
			.trim(),
		sourceCounts,
	);
	const passwords = (
		await sql(target, "SELECT password FROM users ORDER BY id;")
	)
		.toString()
		.trim()
		.split("\n");
	assert.equal(passwords.length, 3);
	for (const password of passwords)
		assert.ok(await compare(credentials.password, password));
	assert.equal(
		(
			await sql(
				target,
				"SELECT count(*) FROM media JOIN posts ON posts.id=media.post_id JOIN users ON users.id=posts.user_id;",
			)
		)
			.toString()
			.trim(),
		"2",
	);
	report.checks.sourcePostgres = {
		bcryptChecks: 3,
		linkedMediaRows: 2,
		mediaFiles: Object.keys(recovery.sourceMediaHashes).length,
	};
	report.checks.overwrittenAndDeletedBytesRecoveredFromArchive = true;
	report.checks.b2RestoredVersionCount = (
		await inventory(b2, targetPrefix)
	).length;
	report.checks.b2IndependentVersionHashes = Object.values(recovery.mapping)
		.map((item) => item.sha256)
		.sort();
	report.checks.b2CurrentStatesAndVersionHashesReconciled = true;
	report.checks.mediaHashes = recovery.sourceMediaHashes;
	report.status = "passed_local_experiment_external_gates_pending";
} catch (error) {
	report.status = "failed";
	report.failure = {
		stage,
		operation: (error as { operation?: string }).operation,
		location: (error as Error).stack?.match(
			/(?:appwrite|media|proof|archive|recovery|topology)\.mts:\d+:\d+/,
		)?.[0],
		code: (error as { code?: number }).code,
		type: (error as { name?: string }).name ?? "Error",
	};
	console.error(`proof_failed:${stage}:details_suppressed`);
	process.exitCode = 1;
} finally {
	stage = "cleanup";
	const errors: string[] = [];
	if (b2) {
		for (const journal of [sourceJournal, targetJournal])
			try {
				await eraseMedia(b2, journal);
			} catch {
				errors.push("owned_b2_cleanup");
			}
		b2.destroy();
	}
	for (const [project, created] of [
		[source, prepared],
		[target, restored],
	] as const)
		if (created) {
			try {
				if (await Bun.file(`${directory(project)}/compose.json`).exists())
					await destroy(project);
				await rm(directory(project), { recursive: true, force: true });
			} catch {
				errors.push("owned_docker_cleanup");
			}
		}
	if (!errors.length) {
		for (const journal of [sourceJournal, targetJournal])
			await rm(
				`${import.meta.dir}/.local/${journal.prefix.split("/")[1]}.journal.json`,
				{ force: true },
			);
		await rm(`${import.meta.dir}/.local/contract`, {
			recursive: true,
			force: true,
		});
	}
	report.cleanup = {
		errors,
		encryptedArchiveAndKey:
			"retained ignored/local mode600 for independent local review; operator must escrow separately or remove after review",
		plaintextProofExports: errors.length
			? "cleanup requires operator intervention"
			: "removed",
		b2VersionsAndOwnedDocker: errors.length ? "check errors" : "removed",
	};
	if (errors.length) {
		report.status = "failed_cleanup";
		process.exitCode = 1;
	}
	report.timingsMs.totalProof = Math.round(performance.now() - started);
	const attempts = await Bun.file(`${import.meta.dir}/attempts.json`).json();
	Object.assign(attempts, {
		acceptedRecovery: false,
		acceptedSyntheticRecovery:
			report.status === "passed_local_experiment_external_gates_pending",
		externalGatesPending: true,
		archiveCreated: Boolean(report.archive),
		recoveryTiming: report.timingsMs,
		recoveredCounts: report.counts ?? null,
		b2Recovery: report.checks.b2CurrentStatesAndVersionHashesReconciled
			? "passed_synthetic_only"
			: "not_proven",
		nextAction:
			"Independent review; final schema, actual source, off-host custody and operator RPO/RTO/retention acceptance remain pending",
	});
	attempts.attempts.push({
		projects: report.projects,
		phase: report.failure?.stage,
		failure: report.failure,
		result: report.status,
		elapsedMs: report.timingsMs.totalProof,
		cleanup: report.cleanup,
	});
	await Bun.write(
		`${import.meta.dir}/attempts.json`,
		`${JSON.stringify(attempts, null, "\t")}\n`,
	);
	await Bun.write(
		`${import.meta.dir}/evidence.json`,
		`${JSON.stringify(report, null, "\t")}\n`,
	);
	console.log(
		JSON.stringify({
			status: report.status,
			stage: report.failure?.stage,
			timingsMs: report.timingsMs,
		}),
	);
}
