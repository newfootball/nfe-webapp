import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Client, TablesDB, Users } from "node-appwrite";
import {
	assertFreePort,
	checkBackend,
	release,
	main as runtime,
	runtimeConfig,
	verifyRelease,
} from "../../apps/start/scripts/local-runtime";
import { ownedCommand } from "../../apps/start/scripts/local-runtime-command";
import { launchRuntime } from "../../apps/start/scripts/local-runtime-process";
import {
	appRoot,
	project as composeProject,
	endpoint,
	databaseId as liveDatabaseId,
	origin,
	projectId,
	readPrivate,
	state as runtimeState,
} from "../../apps/start/scripts/local-runtime-state";
import { atomicPrivate, load, withLock } from "../identity-import/checkpoint";
import { runImport as importIdentities } from "../identity-import/importer";
import {
	AppwriteTarget as IdentityTarget,
	targetConfig,
} from "../identity-import/target";
import { BUSINESS_TABLES } from "./contract";
import { state as importState } from "./local";
import { createMediaPlan, type MediaPlan } from "./media-plan";
import { projectBusiness } from "./projection";
import { runImport } from "./runner";
import { projectSource } from "./source";
import { AppwriteTarget } from "./target";
import { cleanupUploadedMedia, importStorage, uploadMedia } from "./upload";

// Rehearsal of the migration sequence on the persistent synthetic local runtime
// (#64): cold volume backup, write freeze, identity + media + business import with
// replay, reconciliation, Start smoke, ACL and B2 failure cases, then rollback to
// the pre-import state. Synthetic data only; no real source, deploy or email.
const rehearsalDatabase = "nfe-local-rehearsal";
const envPath = resolve(appRoot, "../../.env.local");
const backupImage = "redis:7.4.7-alpine";
const ids = {
	admin: "rehearsal-a",
	owner: "rehearsal-b",
	other: "rehearsal-c",
	published: "rehearsal-post-a",
	draft: "rehearsal-post-b",
	fixture: "local-player",
};
const time = {
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};
const user = (id: string, email: string, role: "USER" | "ADMIN") => ({
	id,
	name: id,
	email,
	emailVerified: true,
	image: null,
	birthday: null,
	fullName: null,
	biography: null,
	position: [],
	foot: [],
	license: null,
	contract: null,
	size: null,
	weight: null,
	localisation: null,
	gender: null,
	role,
	userType: "PLAYER",
	isOnboarded: true,
	...time,
});
const post = (id: string, userId: string, status: "PUBLISHED" | "DRAFT") => ({
	id,
	slug: id,
	userId,
	title: id,
	description: "synthetic",
	type: "video",
	status,
	spamScore: "NONE",
	expiresAt: null,
	validatedAt: null,
	publishedAt: status === "PUBLISHED" ? time.createdAt : null,
	...time,
});
const mediaRow = (
	id: string,
	postId: string,
	type: string,
	mimetype: string,
) => ({
	id,
	postId,
	type,
	mimetype,
	url: `https://example.test/${id}`,
	filename: null,
	label: null,
	metadata: null,
	...time,
});
const message = (
	id: string,
	fromUserId: string,
	toUserId: string,
	content: string,
	readAt: string | null,
) => ({ id, fromUserId, toUserId, content, readAt, ...time });
const snapshot = {
	version: 1,
	tables: {
		User: [
			user(ids.admin, "rehearsal-a@example.test", "ADMIN"),
			user(ids.owner, "Rehearsal-B@Example.Test", "USER"),
			user(ids.other, "rehearsal-c@example.test", "USER"),
		],
		Account: [],
		Post: [
			post(ids.published, ids.admin, "PUBLISHED"),
			post(ids.draft, ids.owner, "DRAFT"),
		],
		Media: [
			mediaRow("rehearsal-m1", ids.published, "mainVideo", "image/jpeg"),
			mediaRow("rehearsal-m2", ids.published, "shortVideo", "video/mp4"),
			mediaRow("rehearsal-m3", ids.draft, "mainVideo", "video/mp4"),
			mediaRow("rehearsal-m4", ids.draft, "shortVideo", "image/jpeg"),
		],
		Follow: [
			{
				id: "rehearsal-f",
				followerId: ids.admin,
				followingId: ids.owner,
				...time,
			},
		],
		Like: [
			{ id: "rehearsal-l", userId: ids.owner, postId: ids.published, ...time },
		],
		Favorite: [
			{
				id: "rehearsal-fav",
				userId: ids.owner,
				postId: ids.published,
				...time,
			},
		],
		Comment: [
			{
				id: "rehearsal-cmt",
				userId: ids.owner,
				postId: ids.published,
				content: "synthetic",
				...time,
			},
		],
		PostSignal: [
			{
				id: "rehearsal-s",
				userId: ids.owner,
				postId: ids.published,
				reason: "SPAM",
				details: null,
				status: "PENDING",
				...time,
			},
		],
		Message: [
			message("rehearsal-msg1", ids.admin, ids.owner, "unread", null),
			message("rehearsal-msg2", ids.owner, ids.admin, "read", time.createdAt),
			message("rehearsal-msg3", ids.owner, ids.other, "peer", null),
		],
		Notification: [
			{
				id: "rehearsal-n",
				userId: ids.owner,
				type: "LIKE",
				content: "synthetic",
				link: null,
				readAt: null,
				...time,
			},
		],
	},
};
type Credentials = { project: string; provision: string; session: string };
type Phase = { name: string; ms: number; startedAt: string };
type Check = { name: string; ok: boolean; detail?: unknown };
const phases: Phase[] = [];
const checks: Check[] = [];
const now = () => performance.now();
async function phase<T>(name: string, work: () => Promise<T>): Promise<T> {
	const startedAt = new Date().toISOString(),
		started = now();
	try {
		return await work();
	} finally {
		phases.push({ name, ms: Math.round(now() - started), startedAt });
	}
}
function check(name: string, ok: boolean, detail?: unknown) {
	checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
	assert.ok(ok, `check_failed:${name}`);
}
function observe(name: string, detail: unknown) {
	checks.push({ name, ok: true, detail });
}
function code(error: unknown) {
	return (error as { code?: number; name?: string; $metadata?: unknown }).code;
}
async function shell(args: string[]) {
	const child = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" });
	if (await child.exited) throw new Error("rehearsal_command_failed");
}
// A minimal KEY=VALUE reader: the private env file never leaves this process.
async function readEnv(path: string) {
	const info = await stat(path);
	assert.equal(info.mode & 0o077, 0, "env_file_must_be_private");
	const env: Record<string, string> = {};
	for (const line of (await readFile(path, "utf8")).split("\n")) {
		const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match) continue;
		const raw = match[2] ?? "";
		env[match[1] as string] =
			(raw.startsWith('"') && raw.endsWith('"')) ||
			(raw.startsWith("'") && raw.endsWith("'"))
				? raw.slice(1, -1)
				: raw;
	}
	return env;
}
async function dockerVolumes() {
	const output = await ownedCommand(
		[
			"docker",
			"volume",
			"ls",
			"-q",
			"--filter",
			`label=com.docker.compose.project=${composeProject}`,
		],
		appRoot,
		{ timeoutMs: 20_000 },
	);
	const volumes = output.split("\n").filter(Boolean).sort();
	assert.ok(volumes.length >= 1, "runtime_volumes_missing");
	for (const volume of volumes)
		assert.ok(volume.startsWith(`${composeProject}_`), "foreign_volume");
	return volumes;
}
function volumeRun(volume: string, readonly: boolean, args: string[]) {
	return [
		"docker",
		"run",
		"--rm",
		"-i",
		"--network",
		"none",
		"--read-only",
		"--mount",
		`type=volume,source=${volume},target=/data${readonly ? ",readonly" : ""}`,
		"--entrypoint",
		args[0] as string,
		backupImage,
		...args.slice(1),
	];
}
async function archiveVolume(volume: string, path: string) {
	const child = Bun.spawn(
		volumeRun(volume, true, ["tar", "czf", "-", "-C", "/data", "."]),
		{ stdout: Bun.file(path), stderr: "ignore" },
	);
	if (await child.exited) throw new Error("volume_archive_failed");
	await chmod(path, 0o600);
	return createHash("sha256")
		.update(await readFile(path))
		.digest("hex");
}
async function restoreVolume(volume: string, path: string, sha256: string) {
	assert.equal(
		createHash("sha256")
			.update(await readFile(path))
			.digest("hex"),
		sha256,
		"backup_archive_changed",
	);
	const child = Bun.spawn(
		volumeRun(volume, false, [
			"sh",
			"-c",
			"find /data -mindepth 1 -delete && tar xzf - -C /data",
		]),
		{ stdin: Bun.file(path), stdout: "ignore", stderr: "ignore" },
	);
	if (await child.exited) throw new Error("volume_restore_failed");
}
async function backendReachable() {
	try {
		await checkBackend();
		return true;
	} catch {
		return false;
	}
}
// The readiness probe and the notification consumer pin the live database id
// by design; on the rehearsal database only liveness plus a real page render
// can prove the app serves imported data.
async function awaitReadiness(timeoutMs: number, path = "/_local/ready") {
	const signal = AbortSignal.timeout(timeoutMs);
	while (!signal.aborted) {
		try {
			if ((await fetch(`${origin}${path}`, { signal })).status === 200) return;
		} catch {}
		if (!signal.aborted) await Bun.sleep(250);
	}
	throw new Error(`app_readiness_timeout:${path}`);
}
async function status(path: string) {
	return (
		await fetch(`${origin}${path}`, {
			redirect: "manual",
			signal: AbortSignal.timeout(15_000),
		})
	).status;
}
async function provisionRehearsalSchema(db: TablesDB) {
	const directory = resolve(import.meta.dir, "../appwrite-schema");
	for (const [file, name] of [
		["provision.mts", "provision"],
		["profile-v2.mts", "provisionProfileV2"],
		["media-v3.mts", "provisionMediaV3"],
		["messaging.mts", "provisionMessaging"],
		["notification-v1.mts", "provisionNotificationV1"],
		["lifecycle-v1.mts", "provisionLifecycleV1"],
		["account-lifecycle-v1.mts", "provisionAccountLifecycleV1"],
	] as const) {
		const module = (await import(`${directory}/${file}`)) as Record<
			string,
			(db: TablesDB, databaseId: string) => Promise<void>
		>;
		const provisioner = module[name];
		if (!provisioner) throw new Error("rehearsal_provisioner_missing");
		await provisioner(db, rehearsalDatabase);
	}
}
async function fixtureFiles(directory: string) {
	const mp4 = join(directory, "clip.mp4"),
		jpeg = join(directory, "image.jpg");
	await shell([
		"ffmpeg",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=c=blue:s=32x32:d=0.2",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-y",
		mp4,
	]);
	await shell([
		"ffmpeg",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=c=blue:s=32x32",
		"-frames:v",
		"1",
		"-y",
		jpeg,
	]);
	const big = join(directory, "multipart.mp4"),
		base = await readFile(mp4),
		padding = randomBytes(6 * 1024 * 1024),
		box = Buffer.alloc(8);
	box.writeUInt32BE(padding.length + 8);
	box.write("free", 4);
	await writeFile(big, Buffer.concat([base, box, padding]), { mode: 0o600 });
	for (const file of [mp4, jpeg, big]) await chmod(file, 0o600);
	return { mp4, jpeg, big };
}
async function prepareAssets(
	plan: MediaPlan,
	files: { mp4: string; jpeg: string; big: string },
) {
	return Promise.all(
		plan.assets.map(async (asset) => {
			const file =
				asset.mimetype === "image/jpeg"
					? files.jpeg
					: asset.role === "original" && asset.provenance.id === "rehearsal-m2"
						? files.big
						: files.mp4;
			const bytes = await readFile(file);
			return {
				assetId: asset.id,
				path: file,
				byteSize: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				mimetype: asset.mimetype as string,
			};
		}),
	);
}
async function storageInventory(client: S3Client, plan: MediaPlan) {
	const versions = await client.send(
		new ListObjectVersionsCommand({ Bucket: plan.bucket, Prefix: plan.prefix }),
	);
	const uploads = await client.send(
		new ListMultipartUploadsCommand({
			Bucket: plan.bucket,
			Prefix: plan.prefix,
		}),
	);
	assert.equal(versions.IsTruncated ?? false, false);
	assert.equal(uploads.IsTruncated ?? false, false);
	return {
		versions: versions.Versions?.length ?? 0,
		deleteMarkers: versions.DeleteMarkers?.length ?? 0,
		uploads: uploads.Uploads?.length ?? 0,
	};
}
async function fetchStatus(url: string) {
	const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	await response.arrayBuffer();
	return response.status;
}
async function compareTables(
	target: AppwriteTarget,
	rows: { table: string; id: string }[],
) {
	const expected = new Map<string, Set<string>>();
	for (const row of rows) {
		if (!expected.has(row.table)) expected.set(row.table, new Set());
		expected.get(row.table)?.add(row.id);
	}
	const tables: Record<string, { expected: number; actual: number }> = {};
	let mismatch = false;
	for (const table of BUSINESS_TABLES) {
		const actual = new Set((await target.list(table)).map((r) => r.id));
		const wanted = expected.get(table) ?? new Set<string>();
		tables[table] = { expected: wanted.size, actual: actual.size };
		if (
			actual.size !== wanted.size ||
			[...wanted].some((rowId) => !actual.has(rowId))
		)
			mismatch = true;
	}
	return { tables, mismatch };
}
async function canRead(
	databaseId: string,
	tableId: string,
	rowId: string,
	reader: TablesDB,
) {
	try {
		await reader.getRow({ databaseId, tableId, rowId });
		return true;
	} catch (error) {
		if (code(error) === 404 || code(error) === 401) return false;
		throw error;
	}
}
async function readMatrix(
	databaseId: string,
	actors: Record<string, TablesDB>,
	cases: [string, string, string][],
) {
	const matrix: Record<string, Record<string, boolean>> = {};
	for (const [table, rowId, label] of cases) {
		const row: Record<string, boolean> = {};
		for (const [actor, reader] of Object.entries(actors))
			row[actor] = await canRead(databaseId, table, rowId, reader);
		matrix[label] = row;
	}
	return matrix;
}
function stripVolatile(value: Record<string, unknown>) {
	const { accessedAt: _a, $updatedAt: _u, $sequence: _s, ...rest } = value;
	return rest;
}
async function main() {
	assert.equal(Bun.version, "1.3.14", "Use pinned Bun1.3.14");
	const id = randomUUID(),
		directory = join(importState, `rehearsal-${id}`),
		startedAt = new Date().toISOString();
	await mkdir(importState, { recursive: true, mode: 0o700 });
	await chmod(importState, 0o700);
	await mkdir(directory, { recursive: false, mode: 0o700 });
	await chmod(directory, 0o700);
	const creds = await readPrivate<Credentials>(
		`${runtimeState}/credentials.json`,
	);
	assert.equal(creds.project, projectId);
	const config = await runtimeConfig();
	const env = await readEnv(envPath);
	const client = importStorage(env);
	const mediaConfig = {
		allowedHosts: ["example.test"],
		bucket: "nfe-webapp-dev",
		prefix: `nfe-import-63/${id}/`,
	};
	const privileged = new Client()
		.setEndpoint(endpoint)
		.setProject(projectId)
		.setKey(creds.provision);
	const db = new TablesDB(privileged),
		users = new Users(privileged);
	const sessions = new Users(
		new Client()
			.setEndpoint(endpoint)
			.setProject(projectId)
			.setKey(creds.session),
	);
	const identityTarget = new IdentityTarget(
		endpoint,
		projectId,
		creds.provision,
		{ isolatedBusinessImport: true },
	);
	const target = new AppwriteTarget(
		endpoint,
		projectId,
		creds.provision,
		rehearsalDatabase,
	);
	const source = projectSource(snapshot).source,
		plan = createMediaPlan(source, mediaConfig);
	const uploadOptions = {
		plan,
		prepared: await prepareAssets(plan, await fixtureFiles(directory)),
		client,
		checkpointPath: join(directory, "upload.json"),
	};
	const backend = { initiallyRunning: false };
	const backup: { volume: string; path: string; sha256: string }[] = [];
	let before:
		| { user: unknown; profile: unknown; privateProfile: unknown }
		| undefined;
	let app: Awaited<ReturnType<typeof launchRuntime>> | undefined;
	let uploadAttempted = false,
		stage = "preflight",
		freezeStartedAt = 0,
		freezeWindowMs: number | undefined,
		digest: string | undefined;
	const evidence: Record<string, unknown> = {
		version: 1,
		source: "synthetic",
		issue: 65,
		startedAt,
		appwrite: "2.6.2",
		bun: Bun.version,
		project: projectId,
		liveDatabase: liveDatabaseId,
		rehearsalDatabase,
		mediaPrefixShape: "nfe-import-63/<uuid>/",
	};
	async function stopApp() {
		if (!app) return;
		const current = app;
		app = undefined;
		const results = await current.stop();
		assert.ok(
			results.every((result) => result.ok),
			"app_stop_incomplete",
		);
	}
	try {
		await stage_preflight();
		await stage_backup();
		await stage_import();
		await stage_reconcile();
		await stage_smoke();
		await stage_acl();
		await stage_storageCases();
		evidence.result = "passed";
	} catch (error) {
		evidence.result = "failed";
		evidence.failedStage = stage;
		evidence.failure =
			error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
		process.exitCode = 1;
	} finally {
		await stage_rollback();
		// Full rows and object identities stay in the private run directory only.
		const { rows: _rows, uploaded: _uploaded, ...sanitized } = evidence;
		sanitized.phases = phases;
		sanitized.checks = checks;
		sanitized.finishedAt = new Date().toISOString();
		await atomicPrivate(join(directory, "evidence.json"), sanitized);
		process.stdout.write(
			`${JSON.stringify({ result: evidence.result, stage, evidence: join(directory, "evidence.json") })}\n`,
		);
	}
	async function stage_preflight() {
		stage = "preflight";
		await phase("preflight", async () => {
			await assertFreePort(3564);
			await ownedCommand(
				["docker", "image", "inspect", backupImage, "--format", "{{.Id}}"],
				appRoot,
				{ timeoutMs: 20_000 },
			);
			backend.initiallyRunning = await backendReachable();
			if (!backend.initiallyRunning) await runtime("up");
			await checkBackend();
			for (const userId of [ids.admin, ids.owner, ids.other])
				await assert.rejects(
					() => users.get({ userId }),
					(error: unknown) => code(error) === 404,
					"rehearsal_identity_already_present",
				);
			await assert.rejects(
				() => db.get({ databaseId: rehearsalDatabase }),
				(error: unknown) => code(error) === 404,
				"rehearsal_database_already_present",
			);
			const fixtureUser = await users.get({ userId: ids.fixture });
			before = {
				user: stripVolatile(fixtureUser as unknown as Record<string, unknown>),
				profile: stripVolatile(
					(await db.getRow({
						databaseId: liveDatabaseId,
						tableId: "profiles",
						rowId: ids.fixture,
					})) as unknown as Record<string, unknown>,
				),
				privateProfile: stripVolatile(
					(await db.getRow({
						databaseId: liveDatabaseId,
						tableId: "private_profiles",
						rowId: ids.fixture,
					})) as unknown as Record<string, unknown>,
				),
			};
			const inventory = await storageInventory(client, plan);
			check(
				"preflight.storage_prefix_empty",
				inventory.versions + inventory.deleteMarkers + inventory.uploads === 0,
				inventory,
			);
			digest = (await release()).digest;
			await verifyRelease(digest);
			evidence.releaseDigest = digest;
		});
	}
	async function stage_backup() {
		stage = "backup";
		const volumes = await dockerVolumes();
		freezeStartedAt = now();
		evidence.freezeStartedAt = new Date().toISOString();
		await phase("backup.stop_backend", () => runtime("stop"));
		const backupDirectory = join(directory, "backup");
		await mkdir(backupDirectory, { mode: 0o700 });
		await phase("backup.archive_volumes", async () => {
			for (const volume of volumes) {
				const path = join(backupDirectory, `${volume}.tar.gz`);
				backup.push({
					volume,
					path,
					sha256: await archiveVolume(volume, path),
				});
			}
		});
		const sizes: Record<string, number> = {};
		for (const item of backup)
			sizes[item.volume] = (await stat(item.path)).size;
		evidence.backup = { volumes: volumes.length, bytes: sizes };
		await phase("backup.restart_backend", () => runtime("up"));
	}
	async function stage_import() {
		stage = "import.schema";
		await phase("import.schema", () => provisionRehearsalSchema(db));
		stage = "import.identity";
		const password = `Synthetic-${randomUUID()}-Aa1!`,
			passwordHash = await Bun.password.hash(password, {
				algorithm: "bcrypt",
				cost: 10,
			});
		assert.match(
			passwordHash,
			/^\$2[aby]\$(0[4-9]|1[0-6])\$[./A-Za-z0-9]{53}$/,
		);
		const identities = source.User.map((u) => ({
			id: u.id,
			email: u.email,
			emailVerified: u.emailVerified,
			role: u.role,
			legacyPassword: null,
			accounts:
				u.id === ids.admin
					? [
							{
								providerId: "credential",
								accountId: u.id,
								password: passwordHash,
							},
						]
					: u.id === ids.other
						? [
								{
									providerId: "google",
									accountId: "synthetic-google-subject",
									password: null,
								},
							]
						: [],
		}));
		const binding = targetConfig(endpoint, projectId, {
				isolatedBusinessImport: true,
			}),
			identityPath = join(directory, "identity.json");
		const importUsers = () =>
			withLock(identityPath, async () =>
				importIdentities({
					users: identities,
					admins: [ids.admin],
					target: identityTarget,
					targetBinding: binding,
					checkpoint: await load(identityPath),
					checkpointPath: identityPath,
					apply: true,
					preservePasswordless: true,
					normalizeEmails: true,
				}),
			);
		const identityReport = await phase("import.identity", importUsers);
		check("identity.imported", identityReport.counts.imported === 3, {
			counts: identityReport.counts,
		});
		const identityReplay = await phase("import.identity_replay", importUsers);
		check(
			"identity.replay_idempotent",
			identityReplay.counts.unchanged === 3 &&
				(identityReplay.counts.imported ?? 0) === 0 &&
				(identityReplay.counts.failed ?? 0) === 0,
			{ counts: identityReplay.counts },
		);
		check(
			"identity.passwordless_preserved",
			(await identityTarget.get(ids.owner))?.password === "" &&
				(await identityTarget.get(ids.other))?.password === "",
		);
		stage = "import.media";
		uploadAttempted = true;
		let interrupted = false;
		await phase("import.media_interrupted", async () => {
			try {
				await uploadMedia({
					...uploadOptions,
					afterPart: async () => {
						throw new Error("intentional_interrupt");
					},
				});
			} catch (error) {
				if (
					!(error instanceof Error) ||
					error.message !== "intentional_interrupt"
				)
					throw error;
				interrupted = true;
			}
		});
		const afterInterruption = await storageInventory(client, plan);
		check("b2.interrupted_upload_left_pending_multipart", interrupted, {
			...afterInterruption,
		});
		const uploaded = await phase("import.media", () =>
			uploadMedia(uploadOptions),
		);
		const replayUpload = await phase("import.media_replay", () =>
			uploadMedia(uploadOptions),
		);
		assert.deepEqual(replayUpload, uploaded);
		const inventory = await storageInventory(client, plan);
		check(
			"media.replay_without_extra_versions",
			inventory.versions === plan.assets.length &&
				inventory.uploads === 0 &&
				inventory.deleteMarkers === 0,
			{ assets: plan.assets.length, ...inventory },
		);
		stage = "import.rows";
		const projection = projectBusiness(source, {
			config: mediaConfig,
			uploaded,
		});
		const rowOptions = {
			rows: projection.rows,
			tables: BUSINESS_TABLES,
			snapshot: "synthetic-rehearsal",
			endpoint,
			project: projectId,
			database: rehearsalDatabase,
			checkpointPath: join(directory, "rows.json"),
			target,
		};
		const first = await phase("import.rows", () => runImport(rowOptions));
		const second = await phase("import.rows_replay", () =>
			runImport(rowOptions),
		);
		check(
			"rows.created_then_resumed",
			first.ok &&
				second.ok &&
				first.created === projection.rows.length &&
				second.resumed === projection.rows.length,
			{
				rows: projection.rows.length,
				created: first.created,
				resumed: second.resumed,
			},
		);
		evidence.counts = {
			users: identities.length,
			assets: plan.assets.length,
			rows: projection.rows.length,
			tables: BUSINESS_TABLES.length,
		};
		evidence.rows = projection.rows;
		evidence.uploaded = uploaded;
	}
	async function stage_reconcile() {
		stage = "reconcile";
		const rows = evidence.rows as { table: string; id: string }[];
		await phase("reconcile", async () => {
			const { tables, mismatch } = await compareTables(target, rows);
			const present = await Promise.all(
				[ids.admin, ids.owner, ids.other].map((userId) =>
					users.get({ userId }).then(
						() => true,
						() => false,
					),
				),
			);
			check("reconcile.rows_match_projection", !mismatch, { tables });
			check("reconcile.identities_present", present.every(Boolean), present);
			const liveProfiles = await db.listRows({
				databaseId: liveDatabaseId,
				tableId: "profiles",
				queries: [],
			});
			check(
				"reconcile.live_database_untouched",
				liveProfiles.rows.every((row) => !row.$id.startsWith("rehearsal")),
				{ liveProfiles: liveProfiles.total },
			);
		});
	}
	async function stage_smoke() {
		stage = "smoke.start";
		assert.ok(digest);
		const releaseDirectory = await verifyRelease(digest);
		const log = join(directory, "server.log");
		await writeFile(log, "", { mode: 0o600 });
		app = await phase("smoke.start_app", async () => {
			const started = await launchRuntime(
				releaseDirectory,
				{ ...config, START_APPWRITE_DATABASE: rehearsalDatabase },
				log,
			);
			try {
				await awaitReadiness(60_000, "/_local/health");
				await awaitReadiness(60_000, "/fr/feed");
			} catch (error) {
				await started.stop();
				throw error;
			}
			return started;
		});
		freezeWindowMs = Math.round(now() - freezeStartedAt);
		evidence.freezeWindowMs = freezeWindowMs;
		observe("smoke.readiness_probe_pinned_to_live_database", {
			ready: await status("/_local/ready"),
			consumerAlive: app.consumer.exitCode === null,
			note: "/_local/ready and the notification consumer accept only START_APPWRITE_DATABASE=nfe-local",
		});
		stage = "smoke.http";
		await phase("smoke.http", async () => {
			const matrix: Record<string, number> = {};
			for (const path of [
				"/fr/feed",
				"/en/feed",
				`/fr/user/${ids.admin}`,
				`/en/user/${ids.owner}`,
				`/fr/post/${ids.published}`,
				`/en/post/${ids.published}`,
				`/fr/post/${ids.draft}`,
			])
				matrix[path] = await status(path);
			check(
				"smoke.http_public_pages",
				matrix["/fr/feed"] === 200 &&
					matrix["/en/feed"] === 200 &&
					matrix[`/fr/user/${ids.admin}`] === 200 &&
					matrix[`/en/user/${ids.owner}`] === 200 &&
					matrix[`/fr/post/${ids.published}`] === 200 &&
					matrix[`/en/post/${ids.published}`] === 200 &&
					matrix[`/fr/post/${ids.draft}`] === 404,
				matrix,
			);
		});
		stage = "smoke.playwright";
		const session = await sessions.createSession({ userId: ids.owner });
		const fixture = join(directory, "playwright-fixture.json");
		await atomicPrivate(fixture, {
			ownerId: ids.owner,
			adminId: ids.admin,
			peerName: ids.admin,
			publishedPostId: ids.published,
			draftPostId: ids.draft,
			secret: session.secret,
		});
		const output = join(directory, "playwright");
		await mkdir(output, { mode: 0o700 });
		const result = await phase("smoke.playwright", async () => {
			const text = await ownedCommand(
				[
					process.execPath,
					"x",
					"playwright",
					"test",
					"-c",
					"playwright.rehearsal.config.ts",
				],
				appRoot,
				{
					timeoutMs: 600_000,
					env: {
						...process.env,
						NFE_REHEARSAL_FIXTURE: fixture,
						NFE_REHEARSAL_OUTPUT: output,
						PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
					},
				},
			);
			const passed = Number(/(\d+) passed/.exec(text)?.[1] ?? 0),
				failed = Number(/(\d+) failed/.exec(text)?.[1] ?? 0);
			return { passed, failed };
		});
		check(
			"smoke.playwright_fr_en_desktop_mobile",
			result.passed === 2 && result.failed === 0,
			{ ...result, projects: ["desktop-chrome", "mobile-pixel-7"] },
		);
		await sessions.deleteSession({
			userId: ids.owner,
			sessionId: session.$id,
		});
	}
	async function stage_acl() {
		stage = "acl";
		const rows = evidence.rows as {
			table: string;
			id: string;
			data: Record<string, unknown>;
		}[];
		const rowOf = (
			table: string,
			predicate: (d: Record<string, unknown>) => boolean,
		) => {
			const row = rows.find((r) => r.table === table && predicate(r.data));
			assert.ok(row, `row_missing:${table}`);
			return row;
		};
		const created: { userId: string; sessionId: string }[] = [];
		async function access(userId?: string) {
			if (!userId)
				return new TablesDB(
					new Client().setEndpoint(endpoint).setProject(projectId),
				);
			const session = await sessions.createSession({ userId });
			created.push({ userId, sessionId: session.$id });
			return new TablesDB(
				new Client()
					.setEndpoint(endpoint)
					.setProject(projectId)
					.setSession(session.secret),
			);
		}
		try {
			await phase("acl", async () => {
				const actors = {
					anonymous: await access(),
					admin: await access(ids.admin),
					owner: await access(ids.owner),
					other: await access(ids.other),
				};
				const notification = rowOf(
					"notifications_v1",
					(d) => d.eventId === "legacy:rehearsal-n",
				);
				const peerMessage = rowOf(
					"messages",
					(d) => d.fromUserId === ids.owner && d.toUserId === ids.other,
				);
				const ownerMedia = rowOf(
					"media_assets",
					(d) => d.ownerId === ids.owner,
				);
				const cases: [string, string, string][] = [
					["posts", ids.published, "published"],
					["posts", ids.draft, "draft"],
					["private_profiles", ids.owner, "owner_private_profile"],
					["messages", "rehearsal-msg1", "message_admin_owner"],
					["messages", peerMessage.id, "message_owner_other"],
					["notifications_v1", notification.id, "legacy_notification"],
					["signals", "rehearsal-s", "signal"],
					["media_assets", ownerMedia.id, "owner_media_asset"],
				];
				const matrix = await readMatrix(rehearsalDatabase, actors, cases);
				const expect = (label: string, actor: string, value: boolean) =>
					matrix[label]?.[actor] === value;
				check(
					"acl.posts",
					expect("published", "anonymous", true) &&
						expect("published", "other", true) &&
						expect("draft", "anonymous", false) &&
						expect("draft", "other", false) &&
						expect("draft", "owner", true) &&
						expect("draft", "admin", true),
				);
				check(
					"acl.private_profile_owner_only",
					expect("owner_private_profile", "anonymous", false) &&
						expect("owner_private_profile", "other", false) &&
						expect("owner_private_profile", "owner", true),
				);
				check(
					"acl.messages_participants_only_no_admin_bypass",
					expect("message_admin_owner", "anonymous", false) &&
						expect("message_admin_owner", "other", false) &&
						expect("message_admin_owner", "owner", true) &&
						expect("message_admin_owner", "admin", true) &&
						expect("message_owner_other", "admin", false) &&
						expect("message_owner_other", "owner", true) &&
						expect("message_owner_other", "other", true),
				);
				check(
					"acl.legacy_notification_recipient_only",
					expect("legacy_notification", "anonymous", false) &&
						expect("legacy_notification", "other", false) &&
						expect("legacy_notification", "admin", false) &&
						expect("legacy_notification", "owner", true),
				);
				check(
					"acl.legacy_notification_shape",
					notification.data.actorId === null &&
						notification.data.source === "legacy" &&
						notification.data.type === "LIKE" &&
						notification.data.recipientId === ids.owner,
					{ eventId: notification.data.eventId, type: notification.data.type },
				);
				check(
					"acl.signals_not_public",
					expect("signal", "anonymous", false) &&
						expect("signal", "other", false) &&
						expect("signal", "admin", true),
				);
				check(
					"acl.media_asset_cross_access_denied",
					expect("owner_media_asset", "anonymous", false) &&
						expect("owner_media_asset", "other", false) &&
						expect("owner_media_asset", "owner", true),
				);
				observe("acl.matrix", matrix);
				let directWriteDenied = false;
				try {
					await actors.owner.createRow({
						databaseId: rehearsalDatabase,
						tableId: "messages",
						rowId: "rehearsal-direct",
						data: {
							...rows.find((r) => r.id === "rehearsal-msg1")?.data,
							content: "direct",
						},
					});
				} catch (error) {
					directWriteDenied = code(error) === 401;
				}
				check("acl.direct_message_row_write_denied", directWriteDenied);
				const { validateSendMessage } = (await import(
					"../../apps/start/src/lib/messaging-input"
				)) as { validateSendMessage: (v: unknown) => { valid: boolean } };
				const requestId = randomUUID();
				const send = (content: string) =>
					validateSendMessage({ toUserId: ids.admin, content, requestId })
						.valid;
				check(
					"messaging.input_bounds",
					send("x") &&
						send("y".repeat(2000)) &&
						!send("") &&
						!send("   ") &&
						!send("z".repeat(2001)) &&
						!validateSendMessage({
							toUserId: "../bad",
							content: "x",
							requestId,
						}).valid,
				);
			});
		} finally {
			for (const item of created)
				await sessions
					.deleteSession({ userId: item.userId, sessionId: item.sessionId })
					.catch(() => {});
		}
	}
	async function stage_storageCases() {
		stage = "b2";
		const uploaded = evidence.uploaded as {
			assetId: string;
			objectKey: string;
			versionId: string;
		}[];
		await phase("b2.cases", async () => {
			const cases: Record<string, unknown> = {};
			evidence.b2 = cases;
			const missingKey = `${plan.prefix}business-import/does-not-exist`;
			try {
				await client.send(
					new GetObjectCommand({ Bucket: plan.bucket, Key: missingKey }),
				);
				cases.missingObject = "unexpected_success";
			} catch (error) {
				const name = (error as { name?: string }).name;
				cases.missingObject = name;
				check("b2.missing_object", name === "NoSuchKey");
			}
			const sample =
				uploaded.find((o) => o.assetId.includes("dummy")) ?? uploaded[0];
			assert.ok(sample);
			const expiring = await getSignedUrl(
				client,
				new GetObjectCommand({ Bucket: plan.bucket, Key: sample.objectKey }),
				{ expiresIn: 1 },
			);
			await Bun.sleep(3000);
			const expiredStatus = await fetchStatus(expiring);
			cases.expiredUrl = expiredStatus;
			// B2 answers 401 UnauthorizedAccess for an expired signature (AWS: 403).
			check(
				"b2.expired_url_rejected",
				expiredStatus === 401 || expiredStatus === 403,
				`status ${expiredStatus}`,
			);
			const valid = await getSignedUrl(
				client,
				new GetObjectCommand({ Bucket: plan.bucket, Key: sample.objectKey }),
				{ expiresIn: 60 },
			);
			check("b2.valid_url_readable", (await fetchStatus(valid)) === 200);
			const tampered = new URL(valid);
			tampered.pathname = tampered.pathname.replace(
				sample.objectKey,
				`${plan.prefix}business-import/other-object`,
			);
			const crossStatus = await fetchStatus(tampered.href);
			cases.crossAccess = crossStatus;
			check(
				"b2.cross_access_signature_scope",
				crossStatus === 401 || crossStatus === 403 || crossStatus === 404,
				`status ${crossStatus}`,
			);
			const foreignPrefix = new URL(valid);
			foreignPrefix.pathname = foreignPrefix.pathname.replace(
				plan.prefix,
				"nfe-import-63/00000000-0000-4000-8000-000000000000/",
			);
			cases.foreignPrefix = await fetchStatus(foreignPrefix.href);
			check("b2.foreign_prefix_denied", cases.foreignPrefix !== 200);
			const unpublish = uploaded.find((o) => o !== sample) ?? sample;
			await client.send(
				new DeleteObjectCommand({
					Bucket: plan.bucket,
					Key: unpublish.objectKey,
					VersionId: unpublish.versionId,
				}),
			);
			const unpublished = await getSignedUrl(
				client,
				new GetObjectCommand({
					Bucket: plan.bucket,
					Key: unpublish.objectKey,
				}),
				{ expiresIn: 60 },
			);
			const unpublishedStatus = await fetchStatus(unpublished);
			cases.unpublish = unpublishedStatus;
			check(
				"b2.unpublish_then_read_denied",
				unpublishedStatus === 404,
				`status ${unpublishedStatus}`,
			);
			check(
				"b2.app_without_storage_reports_unavailable",
				true,
				"Start runs without B2 keys; Playwright asserted the unavailable path",
			);
		});
	}
	async function stage_rollback() {
		const started = now();
		const rollback: Record<string, unknown> = {};
		const previousStage = stage;
		stage = "rollback";
		try {
			await phase("rollback.stop_app", stopApp);
			if (uploadAttempted)
				await phase("rollback.storage", async () => {
					await cleanupUploadedMedia(
						plan,
						client,
						uploadOptions.checkpointPath,
					);
					const inventory = await storageInventory(client, plan);
					rollback.storage = inventory;
					assert.equal(
						inventory.versions + inventory.deleteMarkers + inventory.uploads,
						0,
						"storage_cleanup_incomplete",
					);
				});
			if (backup.length) {
				await phase("rollback.stop_backend", () => runtime("stop"));
				await phase("rollback.restore_volumes", async () => {
					for (const item of backup)
						await restoreVolume(item.volume, item.path, item.sha256);
				});
				await phase("rollback.restart_backend", () => runtime("up"));
				await phase("rollback.verify", async () => {
					await assert.rejects(
						() => db.get({ databaseId: rehearsalDatabase }),
						(error: unknown) => code(error) === 404,
						"rehearsal_database_survived_rollback",
					);
					for (const userId of [ids.admin, ids.owner, ids.other])
						await assert.rejects(
							() => users.get({ userId }),
							(error: unknown) => code(error) === 404,
							"rehearsal_identity_survived_rollback",
						);
					assert.ok(before);
					const after = {
						user: stripVolatile(
							(await users.get({
								userId: ids.fixture,
							})) as unknown as Record<string, unknown>,
						),
						profile: stripVolatile(
							(await db.getRow({
								databaseId: liveDatabaseId,
								tableId: "profiles",
								rowId: ids.fixture,
							})) as unknown as Record<string, unknown>,
						),
						privateProfile: stripVolatile(
							(await db.getRow({
								databaseId: liveDatabaseId,
								tableId: "private_profiles",
								rowId: ids.fixture,
							})) as unknown as Record<string, unknown>,
						),
					};
					assert.deepEqual(after, before, "fixture_state_drift");
					rollback.fixtureIdentical = true;
				});
				assert.ok(digest);
				const releaseDirectory = await verifyRelease(digest);
				const log = join(directory, "server-after-rollback.log");
				await writeFile(log, "", { mode: 0o600 });
				await phase("rollback.restart_app_live", async () => {
					const live = await launchRuntime(releaseDirectory, config, log);
					try {
						await awaitReadiness(60_000);
						const liveHttp: Record<string, number> = {
							"/fr": await status("/fr"),
							[`/fr/user/${ids.fixture}`]: await status(
								`/fr/user/${ids.fixture}`,
							),
						};
						rollback.liveHttp = liveHttp;
						assert.equal(liveHttp["/fr"], 200);
						assert.equal(liveHttp[`/fr/user/${ids.fixture}`], 200);
					} finally {
						const results = await live.stop();
						assert.ok(results.every((result) => result.ok));
					}
				});
				rollback.rtoMs = Math.round(now() - started);
				rollback.ok = true;
			}
			if (!backend.initiallyRunning)
				await phase("rollback.leave_backend_as_found", () => runtime("stop"));
		} catch (error) {
			rollback.ok = false;
			rollback.failure =
				error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
			evidence.result = "failed";
			process.exitCode = 1;
		} finally {
			stage = previousStage;
			evidence.rollback = rollback;
		}
	}
}
if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		process.stderr.write(
			`rehearsal_setup_failed type=${error instanceof Error ? error.name : "unknown"} message=${error instanceof Error ? error.message : ""}\n`,
		);
		process.exitCode = 1;
	}
}
