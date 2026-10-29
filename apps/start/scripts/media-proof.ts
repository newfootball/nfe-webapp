import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import {
	AbortMultipartUploadCommand,
	type CORSRule,
	DeleteBucketCorsCommand,
	DeleteObjectCommand,
	GetBucketAclCommand,
	GetBucketCorsCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { Query } from "node-appwrite";
import { isOwnerOnlyBucketAcl } from "../src/lib/media-policy";
import { storage } from "../src/lib/media-storage.server";
import {
	databaseId,
	fixtureSetup,
	generateMediaFixtures,
	removeFixtureRows,
	selectedB2Configuration,
} from "./media-fixtures";
import { endpoint, state } from "./media-local";

const { c, db, fixture } = await fixtureSetup();
await generateMediaFixtures();
const b2 = await selectedB2Configuration();
Object.assign(process.env, b2, { START_MEDIA_PREFIX: fixture.prefix });
const { s3 } = storage();
const report: Record<string, unknown> = {
	status: "running",
	environment:
		"isolated Appwrite2.6.2 + actual private B2; synthetic generated assets",
	project: c.project,
	schema: "v3-media-allocations",
	browser:
		"Chrome desktop core tests; mounted UI and other engine evidence are reported separately, no physical device claim",
	checks: {},
};
const protectedValues = [
	b2.B2_APPLICATION_KEY_ID,
	b2.B2_APPLICATION_KEY,
	c.proofKey,
	c.sessionKey,
	c.writerKey,
	c.readerKey,
	c.mediaWriterKey,
	c.mediaReaderKey,
	...fixture.actors.flatMap((a: { secret: string; password: string }) => [
		a.secret,
		a.password,
	]),
].filter(Boolean);
let server: ReturnType<typeof Bun.spawn> | undefined;
let baseline: CORSRule[] | undefined;
const ownRule: CORSRule = {
	AllowedOrigins: ["http://127.0.0.1:3555", "http://localhost:3555"],
	AllowedMethods: ["PUT", "GET", "HEAD"],
	AllowedHeaders: ["content-type", "range"],
	ExposeHeaders: ["ETag", "Content-Range", "Accept-Ranges"],
	MaxAgeSeconds: 0,
};
const sameRule = (a: CORSRule, b: CORSRule) => {
	const norm = (r: CORSRule) =>
		JSON.stringify({
			origins: [...(r.AllowedOrigins ?? [])].sort(),
			methods: [...(r.AllowedMethods ?? [])].sort(),
			headers: [...(r.AllowedHeaders ?? [])].map((v) => v.toLowerCase()).sort(),
			expose: [...(r.ExposeHeaders ?? [])].map((v) => v.toLowerCase()).sort(),
			age: r.MaxAgeSeconds,
		});
	return norm(a) === norm(b);
};
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
let exit = 1;
let stage = "private-bucket-preflight";
report.startedAt = new Date().toISOString();
report.testScope = process.env.NFE_MEDIA_UI_GREP
	? "targeted diagnostic; not full acceptance"
	: "full core + mounted UI";
await Bun.write(`${state}/test.log`, "");
await chmod(`${state}/test.log`, 0o600);
try {
	const acl = await s3.send(
		new GetBucketAclCommand({ Bucket: b2.B2_BUCKET_NAME }),
	);
	assert(isOwnerOnlyBucketAcl(acl), "Bucket ACL is not strictly owner-only");
	report.bucketPrivacy = {
		method: "S3 GetBucketAcl",
		ownerOnlyBefore: true,
		httpStatus: acl.$metadata.httpStatusCode,
		noAclOrKeyChanges: true,
	};
	stage = "cors-read";
	baseline = await cors();
	await Bun.write(`${state}/cors-baseline.json`, JSON.stringify(baseline));
	await chmod(`${state}/cors-baseline.json`, 0o600);
	stage = "cors-append-own-rule";
	if (!baseline.some((r) => sameRule(r, ownRule)))
		await s3.send(
			new PutBucketCorsCommand({
				Bucket: b2.B2_BUCKET_NAME,
				CORSConfiguration: { CORSRules: [...baseline, ownRule] },
			}),
		);
	stage = "cors-verification";
	assert((await cors()).some((r) => sameRule(r, ownRule)));
	report.cors = {
		privateBucket: true,
		operation: "append exact own 3555 rule; preserve existing rules",
		before: baseline,
		appended: baseline.some((r) => sameRule(r, ownRule)) ? [] : [ownRule],
	};
	const env = {
		...process.env,
		...b2,
		START_MEDIA_PREFIX: fixture.prefix,
		START_MEDIA_READ_TTL_SECONDS: "3",
		START_APP_ORIGIN: "http://127.0.0.1:3555",
		START_APPWRITE_ENDPOINT: endpoint,
		START_APPWRITE_PROJECT: c.project,
		START_APPWRITE_DATABASE: databaseId,
		START_APPWRITE_SESSION_KEY: c.sessionKey,
		START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
		START_APPWRITE_FEED_READER_KEY: c.readerKey,
		START_APPWRITE_MEDIA_WRITER_KEY: c.mediaWriterKey,
		START_APPWRITE_MEDIA_READER_KEY: c.mediaReaderKey,
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		PORT: "3555",
		NODE_ENV: "production",
	};
	const log = `${state}/server.log`;
	await Bun.write(log, "");
	await chmod(log, 0o600);
	server = Bun.spawn(["bun", "server.ts"], {
		cwd: `${import.meta.dir}/..`,
		env,
		stdout: Bun.file(log),
		stderr: Bun.file(log),
	});
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${env.START_APP_ORIGIN}/en/about`)).ok) break;
		} catch {}
		if (server.exitCode !== null) throw new Error("Server exited");
		await Bun.sleep(250);
	}
	stage = "core-and-mounted-ui";
	const tests = Bun.spawn(
		[
			"bun",
			"x",
			"--bun",
			"--no-install",
			"playwright",
			"test",
			"--config",
			"playwright.media.config.ts",
			"--reporter=json",
		],
		{ cwd: `${import.meta.dir}/..`, env, stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, code] = await Promise.all([
		new Response(tests.stdout).text(),
		new Response(tests.stderr).text(),
		tests.exited,
	]);
	await Bun.write(`${state}/test.log`, out + err);
	await chmod(`${state}/test.log`, 0o600);
	stage = "parse-test-report";
	const results = JSON.parse(out) as {
		suites: {
			title: string;
			specs?: {
				title: string;
				tests: {
					projectName: string;
					annotations?: { type: string; description?: string }[];
					status: string;
					results: { status: string; duration: number }[];
				}[];
			}[];
			suites?: unknown[];
		}[];
		stats: {
			expected: number;
			unexpected: number;
			skipped: number;
			flaky: number;
		};
	};
	const checks: {
		title: string;
		project: string;
		engines: string[];
		playbackWitness: unknown[];
		status: string;
		results: { status: string; duration: number }[];
	}[] = [];
	function collect(suites: typeof results.suites) {
		for (const suite of suites) {
			for (const spec of suite.specs ?? [])
				for (const t of spec.tests)
					checks.push({
						title: spec.title,
						project: t.projectName,
						playbackWitness: (t.annotations ?? [])
							.filter((a) => a.type === "playback-witness")
							.map((a) => JSON.parse(a.description ?? "null")),
						engines: (t.annotations ?? [])
							.filter((a) => a.type === "engine")
							.map((a) => a.description ?? ""),
						status: t.status,
						results: t.results.map((r) => ({
							status: r.status,
							duration: r.duration,
						})),
					});
			if (suite.suites) collect(suite.suites as typeof results.suites);
		}
	}
	collect(results.suites);
	report.checks = checks;
	report.stats = results.stats;
	assert(checks.length > 0, "No executed media checks");
	if (!process.env.NFE_MEDIA_UI_GREP)
		assert(checks.length === 11, "Full acceptance requires all11checks");
	// Keep failures local: assertion diagnostics may include a short-lived capability.
	console.log(
		`Media browser/RPC proof exit ${code}; protected diagnostic in scripts/.media-local/test.log`,
	);
	stage = "secret-and-artifact-scan";
	let files = 0;
	for (const dir of ["dist", ".tanstack", "test-results"]) {
		for await (const path of new Bun.Glob("**/*").scan({
			cwd: `${import.meta.dir}/../${dir}`,
			onlyFiles: true,
		})) {
			const text = await Bun.file(
				`${import.meta.dir}/../${dir}/${path}`,
			).text();
			assert(
				!protectedValues.some((v: string) => text.includes(v)),
				"Secret in generated artifact",
			);
			files++;
		}
	}
	assert(
		!protectedValues.some((v: string) => (out + err).includes(v)),
		"Secret in test log",
	);
	const logs = await Bun.file(log).text();
	assert(
		!protectedValues.some((v: string) => logs.includes(v)),
		"Secret in server log",
	);
	assert(!/X-Amz-Signature=/i.test(logs), "Signed capability in server log");
	report.secretScan = {
		files,
		selectedSecretValuesAbsent: true,
		serverLogsNoCapabilities: true,
	};
	exit = code;
	report.status = code === 0 ? "passed" : "failed";
} catch (error) {
	const failure = error as {
		name?: string;
		$metadata?: { httpStatusCode?: number; attempts?: number };
	};
	report.failureStage = stage;
	report.failureCode =
		failure.name && /^[A-Za-z0-9_]+$/.test(failure.name)
			? failure.name
			: "Suppressed";
	report.providerHttpStatus = failure.$metadata?.httpStatusCode;
	report.providerAttempts = failure.$metadata?.attempts;
	report.status = "failed";
	report.failure =
		"Proof failed; details suppressed to protect credentials and capabilities";
} finally {
	server?.kill();
	if (server) await server.exited;
	try {
		const assets = await db.listRows({
			databaseId,
			tableId: "media_assets",
			queries: [Query.limit(100)],
			total: false,
		});
		assert(assets.rows.length < 100);
		let deletedVersions = 0,
			abortedUploads = 0;
		for (const a of assets.rows) {
			assert(
				a.bucket === b2.B2_BUCKET_NAME &&
					a.objectKey.startsWith(fixture.prefix) &&
					a.objectKey.endsWith(`/${a.$id}`),
			);
			const ref = { Bucket: a.bucket, Key: a.objectKey };
			const uploads = await s3.send(
				new ListMultipartUploadsCommand({
					Bucket: a.bucket,
					Prefix: a.objectKey,
					MaxUploads: 100,
				}),
			);
			const versions = await s3.send(
				new ListObjectVersionsCommand({
					Bucket: a.bucket,
					Prefix: a.objectKey,
					MaxKeys: 100,
				}),
			);
			assert(!uploads.IsTruncated && !versions.IsTruncated);
			const us = (uploads.Uploads ?? []).filter((u) => u.Key === a.objectKey),
				vs = [
					...(versions.Versions ?? []),
					...(versions.DeleteMarkers ?? []),
				].filter((v) => v.Key === a.objectKey);
			// Journal exact owned resources before deletion; no broad bucket/prefix cleanup.
			await Bun.write(
				`${state}/cleanup-${a.$id}.json`,
				JSON.stringify({ ...ref, uploads: us, versions: vs }),
			);
			await chmod(`${state}/cleanup-${a.$id}.json`, 0o600);
			for (const u of us) {
				assert(u.UploadId);
				await s3.send(
					new AbortMultipartUploadCommand({ ...ref, UploadId: u.UploadId }),
				);
				abortedUploads++;
			}
			for (const v of vs) {
				assert(v.VersionId);
				await s3.send(
					new DeleteObjectCommand({ ...ref, VersionId: v.VersionId }),
				);
				deletedVersions++;
			}
		}
		const remainingVersions = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: b2.B2_BUCKET_NAME,
				Prefix: fixture.prefix,
				MaxKeys: 1,
			}),
		);
		const remainingUploads = await s3.send(
			new ListMultipartUploadsCommand({
				Bucket: b2.B2_BUCKET_NAME,
				Prefix: fixture.prefix,
				MaxUploads: 1,
			}),
		);
		assert(
			!remainingVersions.Versions?.length &&
				!remainingVersions.DeleteMarkers?.length &&
				!remainingUploads.Uploads?.length,
		);
		await removeFixtureRows(db, assets.rows, fixture);
		if (baseline && !baseline.some((r) => sameRule(r, ownRule))) {
			const current = await cors();
			const retained = current.filter((r) => !sameRule(r, ownRule));
			if (retained.length)
				await s3.send(
					new PutBucketCorsCommand({
						Bucket: b2.B2_BUCKET_NAME,
						CORSConfiguration: { CORSRules: retained },
					}),
				);
			else
				await s3.send(
					new DeleteBucketCorsCommand({ Bucket: b2.B2_BUCKET_NAME }),
				);
			assert(baseline.every((r) => retained.some((v) => sameRule(r, v))));
		}
		assert(
			isOwnerOnlyBucketAcl(
				await s3.send(new GetBucketAclCommand({ Bucket: b2.B2_BUCKET_NAME })),
			),
			"Bucket ACL changed",
		);
		report.cleanup = {
			deletedVersions,
			abortedUploads,
			remainingVersions: 0,
			remainingUploads: 0,
			corsOwnRuleRemovedExistingRulesPreserved: true,
			appServerStopped: true,
			bucketRetainedPrivate: true,
		};
	} catch {
		report.status = "failed";
		assert(
			isOwnerOnlyBucketAcl(
				await s3.send(new GetBucketAclCommand({ Bucket: b2.B2_BUCKET_NAME })),
			),
			"Bucket ACL changed",
		);
		report.cleanup = {
			failed: true,
			protectedJournal: "scripts/.media-local/cleanup-*.json",
			action: "retry owned cleanup before deleting local backend",
		};
		exit = 1;
	}
	s3.destroy();
	await Bun.write(
		`${state}/proof-summary.json`,
		`${JSON.stringify(report, null, 2)}\n`,
	);
	await chmod(`${state}/proof-summary.json`, 0o600);
}
process.exitCode = exit;
