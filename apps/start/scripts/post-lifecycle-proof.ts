import assert from "node:assert/strict";
import { chmod, mkdir } from "node:fs/promises";
import {
	type CORSRule,
	DeleteBucketCorsCommand,
	DeleteObjectCommand,
	GetBucketAclCommand,
	GetBucketCorsCommand,
	ListObjectVersionsCommand,
	PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { Query } from "node-appwrite";
import { isOwnerOnlyBucketAcl } from "../src/lib/media-policy";
import { storage } from "../src/lib/media-storage.server";
import { proofProxy } from "./interactions-proxy";
import {
	databaseId,
	fixtureSetup,
	generateMediaFixtures,
	selectedB2Configuration,
} from "./post-lifecycle-fixtures";
import { endpoint, state } from "./post-lifecycle-local";

// This entry point is run only after the coordinator grants the exclusive backend lease.
assert.equal(
	process.env.NFE_LIFECYCLE_SYNTHETIC,
	"1",
	"Synthetic opt-in required",
);
const { c, db, fixture } = await fixtureSetup();
await generateMediaFixtures();
const b2 = await selectedB2Configuration();
const proxy = proofProxy(endpoint, c.interactionWriterKey);
Object.assign(process.env, b2, { START_MEDIA_PREFIX: fixture.prefix });
const { s3 } = storage(),
	origin = "http://127.0.0.1:3556";
const sensitive = [
	proxy.token,
	...Object.values(c),
	b2.B2_APPLICATION_KEY_ID,
	b2.B2_APPLICATION_KEY,
	...fixture.actors.flatMap((a: { secret: string; password: string }) => [
		a.secret,
		a.password,
	]),
].filter((v): v is string => typeof v === "string" && v.length > 20);
const report: Record<string, unknown> = {
	status: "running",
	source: "synthetic only",
	appwrite: "2.6.2",
	project: c.project,
	base: "accepted55 + social57",
	retention:
		"immediate exact known synthetic versions only; legacy retained fail-closed",
	phases: [],
	noProductionClaim: true,
};
let baseline: CORSRule[] | undefined,
	server: ReturnType<typeof Bun.spawn> | undefined,
	tests: ReturnType<typeof Bun.spawn> | undefined;
async function progress(step: string, detail: Record<string, unknown> = {}) {
	const path = `${state}/progress-${step}.json`;
	await Bun.write(
		path,
		JSON.stringify({ step, at: new Date().toISOString(), ...detail }),
	);
	await chmod(path, 0o600);
}
async function deadline<T>(
	pending: Promise<T>,
	milliseconds: number,
	label: string,
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			pending,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`${label} deadline exceeded`)),
					milliseconds,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
async function stop(child: ReturnType<typeof Bun.spawn>, label: string) {
	if (child.exitCode === null) child.kill();
	try {
		return await deadline(child.exited, 5000, `${label} SIGTERM`);
	} catch {
		if (child.exitCode === null) child.kill("SIGKILL");
		return deadline(child.exited, 5000, `${label} SIGKILL`);
	}
}
async function save() {
	await Bun.write(
		`${state}/proof-summary.json`,
		JSON.stringify(report, null, 2),
	);
	await chmod(`${state}/proof-summary.json`, 0o600);
}
async function cors() {
	try {
		return (
			(await s3.send(new GetBucketCorsCommand({ Bucket: b2.B2_BUCKET_NAME })))
				.CORSRules ?? []
		);
	} catch (e) {
		if (
			["NoSuchCORSConfiguration", "NoSuchCorsConfiguration"].includes(
				(e as { name: string }).name,
			)
		)
			return [];
		throw e;
	}
}
const ownRule: CORSRule = {
	AllowedOrigins: [origin],
	AllowedMethods: ["PUT", "GET", "HEAD"],
	AllowedHeaders: ["content-type", "range"],
	ExposeHeaders: ["ETag", "Content-Range", "Accept-Ranges"],
	MaxAgeSeconds: 0,
};
try {
	assert(
		isOwnerOnlyBucketAcl(
			await s3.send(new GetBucketAclCommand({ Bucket: b2.B2_BUCKET_NAME })),
		),
	);
	baseline = await cors();
	await Bun.write(`${state}/cors-baseline.json`, JSON.stringify(baseline));
	await chmod(`${state}/cors-baseline.json`, 0o600);
	await s3.send(
		new PutBucketCorsCommand({
			Bucket: b2.B2_BUCKET_NAME,
			CORSConfiguration: { CORSRules: [...baseline, ownRule] },
		}),
	);
	for (const phase of [
		"normal",
		"replacement-failure",
		"withdrawal-failure",
		"version-failure",
		"crash",
		"recovery",
	]) {
		await progress(`${phase}-starting`);
		const log = `${state}/server-${phase}.log`;
		await Bun.write(log, "");
		await chmod(log, 0o600);
		const env = {
			...process.env,
			...b2,
			START_MEDIA_PREFIX: fixture.prefix,
			START_MEDIA_READ_TTL_SECONDS: "3",
			START_APP_ORIGIN: origin,
			START_APPWRITE_ENDPOINT: proxy.endpoint,
			NFE_LIFECYCLE_PROXY_CONTROL: proxy.control,
			NFE_LIFECYCLE_PROXY_TOKEN: proxy.token,
			START_APPWRITE_PROJECT: c.project,
			START_APPWRITE_DATABASE: databaseId,
			START_APPWRITE_SESSION_KEY: c.sessionKey,
			START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
			START_APPWRITE_FEED_READER_KEY: c.readerKey,
			START_APPWRITE_POST_TEXT_WRITER_KEY: c.postWriterKey,
			START_APPWRITE_INTERACTION_WRITER_KEY: c.interactionWriterKey,
			START_APPWRITE_MEDIA_WRITER_KEY: c.mediaWriterKey,
			START_APPWRITE_MEDIA_READER_KEY: c.mediaReaderKey,
			START_APPWRITE_LIFECYCLE_WRITER_KEY: c.lifecycleWriterKey,
			START_LIFECYCLE_SYNTHETIC_PROJECT: c.project,
			START_LIFECYCLE_SYNTHETIC_PREFIX: fixture.prefix,
			START_LIFECYCLE_FAILURE_POINT:
				phase === "replacement-failure"
					? "replacement-before-journal"
					: phase === "crash"
						? "crash:after-version-delete"
						: phase === "withdrawal-failure"
							? "after-withdrawal"
							: phase === "version-failure"
								? "after-version-delete"
								: "",
			START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
			NFE_LIFECYCLE_PHASE: phase,
			PORT: "3556",
			NODE_ENV: "production",
		};
		server = Bun.spawn(["bun", "server.ts"], {
			cwd: `${import.meta.dir}/..`,
			env,
			stdout: Bun.file(log),
			stderr: Bun.file(log),
		});
		await progress(`${phase}-server-spawned`, { pid: server.pid });
		let ready = false;
		for (let n = 0; n < 100; n++) {
			try {
				if (
					(
						await fetch(`${origin}/en/about`, {
							signal: AbortSignal.timeout(2000),
						})
					).ok
				) {
					ready = true;
					break;
				}
			} catch {}
			if (server.exitCode !== null) throw new Error("Proof server exited");
			await Bun.sleep(250);
		}
		assert(ready, "Proof server readiness");
		await progress(`${phase}-server-ready`);
		const stdout = `${state}/stdout-${phase}.log`,
			stderr = `${state}/stderr-${phase}.log`;
		for (const path of [stdout, stderr]) {
			await Bun.write(path, "");
			await chmod(path, 0o600);
		}
		let onExit: (code: number | null) => void = () => {};
		const observedExit = new Promise<number | null>((resolve) => {
			onExit = resolve;
		});
		tests = Bun.spawn(
			[
				"bun",
				"x",
				"--bun",
				"--no-install",
				"playwright",
				"test",
				"--config",
				"playwright.post-lifecycle.config.ts",
				"--grep",
				`^.*${phase}:`,
			],
			{
				cwd: `${import.meta.dir}/..`,
				env,
				stdout: Bun.file(stdout),
				stderr: Bun.file(stderr),
				onExit(_child, code) {
					onExit(code);
				},
			},
		);
		await progress(`${phase}-tests-spawned`, {
			pid: tests.pid,
			stdout,
			stderr,
		});
		// Eight normal cases (including both mounted locales), one in each failure
		// phase: preserve every 240s test allowance plus two minutes of runner setup.
		const phaseDeadline = (phase === "normal" ? 8 : 1) * 240000 + 120000;
		const exit = await deadline(
			Promise.race([
				observedExit.then(async (code) => {
					await progress(`${phase}-onexit`, { code });
					return code;
				}),
				tests.exited.then(async (code) => {
					await progress(`${phase}-exited-promise`, { code });
					return code;
				}),
			]),
			phaseDeadline,
			`${phase} tests`,
		);
		await progress(`${phase}-exit-observed`, { exit });
		tests = undefined;
		const [out, err] = await Promise.all([
			Bun.file(stdout).text(),
			Bun.file(stderr).text(),
		]);
		await progress(`${phase}-diagnostics-read`, {
			stdoutBytes: out.length,
			stderrBytes: err.length,
		});
		let diagnostic = out + err;
		for (const value of sensitive)
			diagnostic = diagnostic.replaceAll(value, "[REDACTED]");
		await Bun.write(`${state}/test-${phase}.log`, diagnostic);
		await chmod(`${state}/test-${phase}.log`, 0o600);
		process.stdout.write(diagnostic);
		(report.phases as unknown[]).push({ phase, exit });
		await save();
		const serverExit = await stop(server, `${phase} server`);
		if (phase === "crash")
			assert.equal(serverExit, 86, "Worker must terminate after DeleteObject");
		server = undefined;
		assert(
			!sensitive.some((value) => (diagnostic + "").includes(value)),
			"Sensitive diagnostic",
		);
		assert.equal(exit, 0, `Lifecycle phase ${phase}`);
	}
	report.status = "passed";
} catch (e) {
	report.status = "failed";
	report.failure = { name: (e as Error).name, message: (e as Error).message };
	throw e;
} finally {
	if (tests) await stop(tests, "Playwright");
	if (server) {
		await stop(server, "Proof server");
	}
	// Teardown owns this entire synthetic project, but every B2 delete is still
	// restricted to a known allocation key and a freshly enumerated exact version.
	const cleanup: unknown[] = [];
	try {
		const assets = (
			await db.listRows({
				databaseId,
				tableId: "media_assets",
				queries: [Query.limit(100)],
				total: false,
			})
		).rows;
		assert(assets.length < 100);
		await Bun.write(
			`${state}/cleanup-journal.json`,
			JSON.stringify(
				assets.map((a) => ({
					id: a.$id,
					key: a.objectKey,
					bucket: a.bucket,
					owner: a.ownerId,
				})),
			),
		);
		await chmod(`${state}/cleanup-journal.json`, 0o600);
		for (const a of assets) {
			assert(
				fixture.actors.some((actor: { id: string }) => actor.id === a.ownerId),
			);
			assert(
				a.objectKey.startsWith(fixture.prefix) &&
					a.objectKey.endsWith(`/${a.$id}`) &&
					a.bucket === b2.B2_BUCKET_NAME,
			);
			const listed = await s3.send(
				new ListObjectVersionsCommand({
					Bucket: a.bucket,
					Prefix: a.objectKey,
					MaxKeys: 100,
				}),
			);
			assert(!listed.IsTruncated);
			for (const version of [
				...(listed.Versions ?? []),
				...(listed.DeleteMarkers ?? []),
			]) {
				if (version.Key !== a.objectKey) continue;
				assert(version.VersionId);
				await s3.send(
					new DeleteObjectCommand({
						Bucket: a.bucket,
						Key: a.objectKey,
						VersionId: version.VersionId,
					}),
				);
				cleanup.push({ assetId: a.$id, exactVersionDeleted: true });
			}
		}
		report.cleanup = {
			knownKeys: assets.length,
			extraVersions: cleanup.length,
			complete: true,
		};
	} catch (e) {
		report.cleanup = { complete: false, error: (e as Error).name };
		report.status = "failed";
	}
	if (baseline) {
		if (baseline.length)
			await s3.send(
				new PutBucketCorsCommand({
					Bucket: b2.B2_BUCKET_NAME,
					CORSConfiguration: { CORSRules: baseline },
				}),
			);
		else
			await s3.send(new DeleteBucketCorsCommand({ Bucket: b2.B2_BUCKET_NAME }));
		assert.deepEqual(await cors(), baseline);
		report.corsRestored = true;
	}
	proxy.stop();
	s3.destroy();
	await save();
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/post-lifecycle-synthetic.json`,
		JSON.stringify(report, null, 2) + "\n",
	);
}

assert.equal(report.status, "passed", "Lifecycle proof or cleanup failed");
