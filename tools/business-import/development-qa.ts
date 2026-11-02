import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectVersionsCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
	Client,
	Permission,
	Query,
	Role,
	TablesDB,
	Users,
} from "node-appwrite";
import { importStorage } from "./upload";

type Row = Record<string, any>;
const run = (
	await readFile(
		join(
			process.env.HOME!,
			".agents/tasks/nfe-start-appwrite-2026-10-29/orchestration/business-import/active-development-run.txt",
		),
		"utf8",
	)
).trim();
const config = JSON.parse(await readFile(join(run, "config.json"), "utf8"));
const creds = JSON.parse(
	await readFile(join(import.meta.dir, ".local/credentials.json"), "utf8"),
);
assert.equal(config.endpoint, "http://127.0.0.1:18663/v1");
assert.equal(config.project, "nfe-import-63-proof");
assert.equal(config.database, "nfe-business");
assert.equal(config.project, creds.project);
assert.match(config.media.prefix, /^nfe-import-63\/[0-9a-f-]+\/$/);
const db = new TablesDB(
	new Client()
		.setEndpoint(config.endpoint)
		.setProject(config.project)
		.setKey(creds.key),
);
const users = new Users(
	new Client()
		.setEndpoint(config.endpoint)
		.setProject(config.project)
		.setKey(creds.key),
);
const s3 = importStorage(config.b2);
const ref = (tableId: string, rowId: string) => ({
	databaseId: config.database,
	tableId,
	rowId,
});
async function all(tableId: string): Promise<Row[]> {
	const rows: Row[] = [];
	for (;;) {
		const page = await db.listRows({
			databaseId: config.database,
			tableId,
			queries: [
				Query.limit(100),
				...(rows.length ? [Query.cursorAfter(rows.at(-1)!.$id)] : []),
			],
			total: false,
		});
		rows.push(...page.rows);
		if (page.rows.length < 100) return rows;
	}
}
const data = (row: Row) =>
	Object.fromEntries(
		Object.entries(row).filter(([key]) => !key.startsWith("$")),
	);
const qa = randomUUID().replaceAll("-", "").slice(0, 20);
const postId = `qa_${qa}`;
const fixturePath = join(run, `qa-${qa}.json`);
const manifestPath = join(run, `qa-${qa}-manifest.json`);
const objectReceipts: { id: string; key: string; version: string }[] = [];
const created: { table: string; id: string }[] = [];
let session: { $id: string; userId: string; secret: string } | undefined;
let server: ReturnType<typeof Bun.spawn> | undefined;
let result = false;
async function saveManifest() {
	await writeFile(
		manifestPath,
		JSON.stringify({ postId, objectReceipts, created }),
		{ mode: 0o600 },
	);
	await chmod(manifestPath, 0o600);
}
async function create(
	table: string,
	id: string,
	values: Row,
	permissions: string[],
) {
	await db.createRow({ ...ref(table, id), data: values, permissions });
	created.push({ table, id });
	await saveManifest();
}
async function remove(table: string, id: string) {
	try {
		await db.deleteRow(ref(table, id));
	} catch (error) {
		if ((error as { code?: number }).code !== 404) throw error;
	}
}
try {
	await new Promise<void>((resolve, reject) => {
		const probe = createServer();
		probe.once("error", reject);
		probe.listen(3563, "127.0.0.1", () => probe.close(() => resolve()));
	});
	const [posts, profiles, assets, media] = await Promise.all([
		all("posts"),
		all("profiles"),
		all("media_assets"),
		all("media"),
	]);
	const profile = profiles.find(
		(p) =>
			p.isOnboarded &&
			!p.image &&
			posts.some((x) => x.userId === p.$id && x.status === "PUBLISHED"),
	);
	assert(profile, "No onboarded public fallback profile");
	const missing = posts.find(
		(p) =>
			p.status === "PUBLISHED" &&
			profiles.some(
				(profile) => profile.$id === p.userId && profile.isOnboarded,
			) &&
			!assets.some(
				(a) =>
					a.postId === p.$id && a.kind === "video" && a.state === "ATTACHED",
			),
	);
	assert(missing, "No published post with missing video");
	const source = ["video", "thumbnail"].map((kind) =>
		assets.find(
			(a) => a.kind === kind && a.state === "ATTACHED" && a.versionId,
		),
	);
	assert(source.every(Boolean), "No imported video and thumbnail pair");
	session = await users.createSession({ userId: profile.$id });
	const now = new Date().toISOString();
	await create(
		"posts",
		postId,
		{
			userId: profile.$id,
			slug: postId,
			title: "Synthetic QA import",
			description: "Synthetic QA import",
			titleFolded: "synthetic qa import",
			descriptionFolded: "synthetic qa import",
			type: "video",
			status: "PUBLISHED",
			createdAt: now,
			updatedAt: now,
			publishedAt: now,
			expiresAt: null,
			validatedAt: null,
		},
		[Permission.read(Role.any())],
	);
	await create("post_private", postId, { spamScore: "NONE" }, [
		Permission.read(Role.label("admin")),
	]);
	for (let i = 0; i < 2; i++) {
		const delivery = source[i]!;
		const sourceArchive = assets.find((a) => {
			if (a.kind !== `original-${delivery.kind}` || a.state !== "REJECTED")
				return false;
			try {
				return JSON.parse(a.metadataJson).sourceId === delivery.$id;
			} catch {
				return false;
			}
		});
		assert(sourceArchive, "Imported original missing");
		const deliveryId = `qa_${qa}_${i}`;
		const archiveId = `orig_${createHash("sha256")
			.update(JSON.stringify(["media", deliveryId]))
			.digest("hex")
			.slice(0, 31)}`;
		for (const [id, isOriginal] of [
			[deliveryId, false],
			[archiveId, true],
		] as const) {
			const original: Row = isOriginal ? sourceArchive : delivery;
			const sourceObject = await s3.send(
				new GetObjectCommand({
					Bucket: original.bucket,
					Key: original.objectKey,
					VersionId: original.versionId,
				}),
			);
			const bytes = await sourceObject.Body!.transformToByteArray();
			assert.equal(
				createHash("sha256").update(bytes).digest("hex"),
				original.sha256,
			);
			const key = `${config.media.prefix}qa-${qa}/${id}`;
			const uploaded = await s3.send(
				new PutObjectCommand({
					Bucket: config.b2.B2_BUCKET_NAME,
					Key: key,
					Body: bytes,
					ContentType: original.mimetype,
				}),
			);
			assert(uploaded.VersionId);
			objectReceipts.push({ id, key, version: uploaded.VersionId });
			await saveManifest();
			const common = {
				...data(original),
				ownerId: profile.$id,
				postId,
				kind: original.kind,
				state: isOriginal ? "REJECTED" : "ATTACHED",
				objectKey: key,
				versionId: uploaded.VersionId,
				metadataJson: isOriginal
					? JSON.stringify({
							role: "original",
							source: "media",
							sourceId: deliveryId,
						})
					: null,
				createdAt: now,
				updatedAt: now,
			};
			await create("media_assets", id, common, [
				Permission.read(Role.user(profile.$id)),
			]);
			if (!isOriginal) {
				const sourceMedia = media.find((m) => m.$id === original.$id);
				assert(sourceMedia);
				await create(
					"media",
					id,
					{
						...data(sourceMedia),
						postId,
						ownerId: profile.$id,
						objectKey: key,
						versionId: uploaded.VersionId,
						createdAt: now,
						updatedAt: now,
					},
					[Permission.read(Role.user(profile.$id))],
				);
			}
		}
	}
	await writeFile(
		fixturePath,
		JSON.stringify({
			ownerId: profile.$id,
			secret: session.secret,
			postId,
			missingPostId: missing.$id,
			fallbackProfileId: profile.$id,
		}),
		{ mode: 0o600 },
	);
	await chmod(fixturePath, 0o600);
	const env = {
		...process.env,
		PATH: `${process.env.HOME}/.nvm/versions/node/v24.22.1/bin:${process.env.PATH}`,
		...config.b2,
		...creds.runtimeKeys,
		START_APP_ORIGIN: "http://127.0.0.1:3563",
		START_APPWRITE_ENDPOINT: config.endpoint,
		START_APPWRITE_PROJECT: config.project,
		START_APPWRITE_DATABASE: config.database,
		START_MEDIA_PREFIX: config.media.prefix,
		START_LIFECYCLE_SYNTHETIC_PROJECT: config.project,
		START_LIFECYCLE_SYNTHETIC_PREFIX: config.media.prefix,
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		PORT: "3563",
		NODE_ENV: "production",
		NFE_BUSINESS_QA_FIXTURE: fixturePath,
		NFE_BUSINESS_QA_OUTPUT: join(run, `qa-${qa}-playwright`),
	};
	const log = Bun.file(join(run, `qa-${qa}-server.log`));
	await Bun.write(log, "", { mode: 0o600 });
	server = Bun.spawn(["bun", "server.ts"], {
		cwd: "apps/start",
		env,
		stdout: log,
		stderr: log,
	});
	let ready = false;
	for (let n = 0; n < 100; n++) {
		try {
			if (
				(
					await fetch("http://127.0.0.1:3563/en/about", {
						signal: AbortSignal.timeout(1000),
					})
				).ok
			) {
				ready = true;
				break;
			}
		} catch {}
		await Bun.sleep(200);
	}
	assert(ready, "QA server unavailable");
	const node = Bun.spawn(["node", "--version"], {
		cwd: "apps/start",
		env,
		stdout: "pipe",
		stderr: "ignore",
	});
	const nodeVersion = (await new Response(node.stdout).text()).trim();
	assert.equal(await node.exited, 0);
	assert.match(nodeVersion, /^v24\./);
	await mkdir(env.NFE_BUSINESS_QA_OUTPUT, { mode: 0o700 });
	const testLog = Bun.file(join(run, `qa-${qa}-playwright.log`));
	await Bun.write(testLog, "", { mode: 0o600 });
	const test = Bun.spawn(
		[
			"bunx",
			"playwright",
			"test",
			"--config",
			"playwright.business-import.config.ts",
		],
		{ cwd: "apps/start", env, stdout: testLog, stderr: testLog },
	);
	const browserExit = await test.exited;
	const inspectionOps = await db.listRows({
		databaseId: config.database,
		tableId: "post_lifecycle_operations",
		queries: [Query.equal("postId", postId), Query.limit(10)],
		total: false,
	});
	const inspectionObjects = [];
	for (const object of objectReceipts) {
		const listed = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: config.b2.B2_BUCKET_NAME,
				Prefix: object.key,
			}),
		);
		inspectionObjects.push({
			id: object.id,
			truncated: !!listed.IsTruncated,
			versions: [
				...(listed.Versions ?? []),
				...(listed.DeleteMarkers ?? []),
			].filter((v) => v.Key === object.key).length,
		});
	}
	await writeFile(
		join(run, `qa-${qa}-application.json`),
		JSON.stringify({
			browserExit,
			operations: inspectionOps.rows.map((op) => ({
				phase: op.phase,
				assetStep: op.assetStep,
				versionStep: op.versionStep,
			})),
			objects: inspectionObjects,
		}),
		{ mode: 0o600 },
	);
	assert.equal(browserExit, 0, "Browser proof failed");
	for (const object of objectReceipts) {
		const versions = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: config.b2.B2_BUCKET_NAME,
				Prefix: object.key,
			}),
		);
		assert(
			![...(versions.Versions ?? []), ...(versions.DeleteMarkers ?? [])].some(
				(v) => v.Key === object.key,
			),
		);
	}
	try {
		await db.getRow(ref("posts", postId));
		throw new Error("QA post still exists");
	} catch (error) {
		if ((error as { code?: number }).code !== 404) throw error;
	}
	const ops = await db.listRows({
		databaseId: config.database,
		tableId: "post_lifecycle_operations",
		queries: [Query.equal("postId", postId), Query.limit(10)],
		total: false,
	});
	assert.equal(ops.rows.length, 1);
	assert.equal(ops.rows[0]?.phase, "DONE");
	for (const receipt of objectReceipts) {
		const row = await db.getRow(ref("media_assets", receipt.id));
		assert.equal(row.state, "CANCELLED");
		assert.equal(row.postId, null);
		try {
			await db.getRow(ref("media", receipt.id));
			throw new Error("QA media still exists");
		} catch (error) {
			if ((error as { code?: number }).code !== 404) throw error;
		}
	}
	result = true;
	console.log(
		"QA browser deletion completed; four exact keys empty and post absent.",
	);
} finally {
	const cleanupFailures: string[] = [];
	async function attempt(name: string, action: () => Promise<unknown>) {
		try {
			await action();
		} catch (error) {
			cleanupFailures.push(name);
			console.error(`Cleanup failure: ${name}`, error);
		}
	}
	if (server)
		await attempt("server", async () => {
			server!.kill("SIGTERM");
			await server!.exited;
		});
	for (const object of objectReceipts)
		await attempt(`object ${object.id}`, async () => {
			const listed = await s3.send(
				new ListObjectVersionsCommand({
					Bucket: config.b2.B2_BUCKET_NAME,
					Prefix: object.key,
				}),
			);
			assert(!listed.IsTruncated);
			if (
				[...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])].some(
					(v) => v.Key === object.key && v.VersionId === object.version,
				)
			) {
				await s3.send(
					new DeleteObjectCommand({
						Bucket: config.b2.B2_BUCKET_NAME,
						Key: object.key,
						VersionId: object.version,
					}),
				);
			}
		});
	if (created.some((row) => row.table === "posts" && row.id === postId)) {
		await attempt("operations", async () => {
			const ops = await db.listRows({
				databaseId: config.database,
				tableId: "post_lifecycle_operations",
				queries: [Query.equal("postId", postId), Query.limit(100)],
				total: false,
			});
			for (const op of ops.rows)
				await attempt(`operation ${op.$id}`, () =>
					remove("post_lifecycle_operations", op.$id),
				);
		});
		await attempt("lock", () => remove("post_lifecycle_locks", postId));
		for (const row of created.toReversed())
			await attempt(`${row.table} ${row.id}`, () => remove(row.table, row.id));
	}
	if (session)
		await attempt("session", () =>
			users.deleteSession({ userId: session!.userId, sessionId: session!.$id }),
		);
	s3.destroy();
	await attempt("fixture redact", () =>
		writeFile(
			fixturePath,
			JSON.stringify({ postId, result, cleanupFailures }),
			{ mode: 0o600 },
		),
	);
	if (cleanupFailures.length) {
		console.error(`QA cleanup incomplete: ${cleanupFailures.length} failures`);
		process.exitCode = 1;
	}
}
