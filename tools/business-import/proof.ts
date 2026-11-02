import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { hash as bcrypt } from "bcryptjs";
import { parse } from "dotenv";
import { Account, Client, TablesDB } from "node-appwrite";
import { resolveSubject } from "../../apps/start/src/lib/oauth-registry";
import { atomicPrivate, load, withLock } from "../identity-import/checkpoint";
import { runImport as importIdentities } from "../identity-import/importer";
import { providerRegistry } from "../identity-import/oauth-registry";
import {
	AppwriteTarget as IdentityTarget,
	targetConfig,
} from "../identity-import/target";
import { BUSINESS_TABLES } from "./contract";
import { databaseId, endpoint, projectId, state } from "./local";
import { createMediaPlan } from "./media-plan";
import { projectBusiness } from "./projection";
import { runImport } from "./runner";
import { projectSource } from "./source";
import { AppwriteTarget } from "./target";
import { cleanupUploadedMedia, importStorage, uploadMedia } from "./upload";

async function command(args: string[]) {
	const child = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" });
	if (await child.exited) throw new Error("fixture_command_failed");
}
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
async function main() {
	const id = randomUUID(),
		directory = join(state, `proof-${id}`);
	await mkdir(directory, { recursive: false, mode: 0o700 });
	await chmod(directory, 0o700);
	const creds = (await Bun.file(join(state, "credentials.json")).json()) as {
		project: string;
		key: string;
	};
	assert.equal(creds.project, projectId);
	const envPath =
		"/Users/faharihamadasidi/Sites/github.com/newfootball/nfe-webapp/.env.local";
	const st = await Bun.file(envPath).stat();
	assert.equal(st.mode & 0o077, 0);
	const env = parse(await readFile(envPath));
	const client = importStorage(env);
	const config = {
		allowedHosts: ["example.test"],
		bucket: "nfe-webapp-dev",
		prefix: `nfe-import-63/${id}/`,
	};
	const data = {
		version: 1,
		tables: {
			User: [
				user("proof-a", "proof-a@example.test", "ADMIN"),
				user("proof-b", "Proof-B@Example.Test", "USER"),
				user("proof-c", "proof-c@example.test", "USER"),
			],
			Account: [],
			Post: [
				post("proof-post-a", "proof-a", "PUBLISHED"),
				post("proof-post-b", "proof-b", "DRAFT"),
			],
			Media: [
				mediaRow("proof-m1", "proof-post-a", "mainVideo", "image/jpeg"),
				mediaRow("proof-m2", "proof-post-a", "shortVideo", "video/mp4"),
				mediaRow("proof-m3", "proof-post-b", "mainVideo", "video/mp4"),
				mediaRow("proof-m4", "proof-post-b", "shortVideo", "image/jpeg"),
			],
			Follow: [
				{
					id: "proof-f",
					followerId: "proof-a",
					followingId: "proof-b",
					...time,
				},
			],
			Like: [
				{ id: "proof-l", userId: "proof-b", postId: "proof-post-a", ...time },
			],
			Favorite: [
				{ id: "proof-fav", userId: "proof-b", postId: "proof-post-a", ...time },
			],
			Comment: [
				{
					id: "proof-cmt",
					userId: "proof-b",
					postId: "proof-post-a",
					content: "synthetic",
					...time,
				},
			],
			PostSignal: [
				{
					id: "proof-s",
					userId: "proof-b",
					postId: "proof-post-a",
					reason: "SPAM",
					details: null,
					status: "PENDING",
					...time,
				},
			],
			Message: [
				{
					id: "proof-msg1",
					fromUserId: "proof-a",
					toUserId: "proof-b",
					content: "unread",
					readAt: null,
					...time,
				},
				{
					id: "proof-msg2",
					fromUserId: "proof-b",
					toUserId: "proof-a",
					content: "read",
					readAt: time.createdAt,
					...time,
				},
			],
			Notification: [
				{
					id: "proof-n",
					userId: "proof-b",
					type: "LIKE",
					content: "synthetic",
					link: null,
					readAt: null,
					...time,
				},
			],
		},
	};
	const source = projectSource(data).source,
		plan = createMediaPlan(source, config);
	const password = `Synthetic-${randomUUID()}-Aa1!`,
		passwordHash = await bcrypt(password, 10);
	const identities = source.User.map((u) => ({
		id: u.id,
		email: u.email,
		emailVerified: u.emailVerified,
		role: u.role,
		legacyPassword: null,
		accounts:
			u.id === "proof-a"
				? [
						{
							providerId: "credential",
							accountId: u.id,
							password: passwordHash,
						},
					]
				: u.id === "proof-c"
					? [
							{
								providerId: "google",
								accountId: "synthetic-google-subject",
								password: null,
							},
						]
					: [],
	}));
	const registry = providerRegistry(
		identities.map((u) => ({
			id: u.id,
			accounts: u.accounts.map(({ providerId, accountId }) => ({
				providerId,
				accountId,
			})),
		})),
		"a".repeat(64),
	);
	assert.equal(
		resolveSubject(registry, "synthetic-google-subject", null),
		"proof-c",
	);
	assert.throws(() => resolveSubject(registry, "unknown", null));
	const mp4 = join(directory, "clip.mp4"),
		jpeg = join(directory, "image.jpg"),
		webp = join(directory, "image.webp");
	await command([
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
	await command([
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
	await command(["cwebp", "-quiet", jpeg, "-o", webp]);
	const big = join(directory, "multipart.mp4"),
		base = await readFile(mp4),
		padding = randomBytes(6 * 1024 * 1024),
		box = Buffer.alloc(8);
	box.writeUInt32BE(padding.length + 8);
	box.write("free", 4);
	await writeFile(big, Buffer.concat([base, box, padding]), { mode: 0o600 });
	await command([
		"ffprobe",
		"-v",
		"error",
		"-show_entries",
		"format=format_name",
		big,
	]);
	await command(["ffmpeg", "-v", "error", "-i", big, "-f", "null", "-"]);
	const prepared = await Promise.all(
		plan.assets.map(async (asset) => {
			const file =
				asset.mimetype === "image/jpeg"
					? jpeg
					: asset.id === "orig_dummy"
						? mp4
						: asset.role === "original" && asset.provenance.id === "proof-m2"
							? big
							: mp4;
			await chmod(file, 0o600);
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
	const uploadOptions = {
		plan,
		prepared,
		client,
		checkpointPath: join(directory, "upload.json"),
	};
	const identityTarget = new IdentityTarget(endpoint, projectId, creds.key, {
		isolatedBusinessImport: true,
	});
	const target = new AppwriteTarget(endpoint, projectId, creds.key, databaseId);
	const binding = targetConfig(endpoint, projectId, {
			isolatedBusinessImport: true,
		}),
		identityPath = join(directory, "identity.json");
	let stage = "identity",
		uploadAttempted = false;
	try {
		const report = await withLock(identityPath, async () =>
			importIdentities({
				users: identities,
				admins: ["proof-a"],
				target: identityTarget,
				targetBinding: binding,
				checkpoint: await load(identityPath),
				checkpointPath: identityPath,
				apply: true,
				preservePasswordless: true,
				normalizeEmails: true,
			}),
		);
		assert.equal(report.counts.imported, 3);
		assert.equal(report.counts.failed ?? 0, 0);
		const login = new Account(
			new Client().setEndpoint(endpoint).setProject(projectId),
		);
		await login.createEmailPasswordSession({
			email: "proof-a@example.test",
			password,
		});
		assert.equal((await identityTarget.get("proof-b"))?.password, "");
		assert.equal((await identityTarget.get("proof-c"))?.password, "");
		stage = "multipart";
		uploadAttempted = true;
		let interrupted = false;
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
		assert.ok(interrupted);
		const uploaded = await uploadMedia(uploadOptions),
			replay = await uploadMedia(uploadOptions);
		assert.deepEqual(replay, uploaded);
		const versions = await client.send(
			new ListObjectVersionsCommand({
				Bucket: plan.bucket,
				Prefix: plan.prefix,
			}),
		);
		assert.equal(versions.IsTruncated, false);
		assert.equal(versions.Versions?.length, plan.assets.length);
		stage = "rows";
		const projection = projectBusiness(source, { config, uploaded });
		const options = {
			rows: projection.rows,
			tables: BUSINESS_TABLES,
			snapshot: "synthetic-a",
			endpoint,
			project: projectId,
			database: databaseId,
			checkpointPath: join(directory, "rows.json"),
			target,
		};
		const first = await runImport(options),
			second = await runImport(options);
		assert.ok(first.ok && second.ok);
		assert.equal(first.created, projection.rows.length);
		assert.equal(second.resumed, projection.rows.length);
		const db = new TablesDB(
			new Client()
				.setEndpoint(endpoint)
				.setProject(projectId)
				.setKey(creds.key),
		);
		const foreign = "proof-foreign";
		await db.createRow({
			databaseId,
			tableId: "post_private",
			rowId: foreign,
			data: { spamScore: null },
			permissions: [],
		});
		try {
			await assert.rejects(() => runImport(options), /foreign_target_row/);
		} finally {
			await db.deleteRow({
				databaseId,
				tableId: "post_private",
				rowId: foreign,
			});
		}
		stage = "acl";
		async function access(userId?: string) {
			const session = userId
				? await identityTarget.users.createSession({ userId })
				: null;
			return new TablesDB(
				session
					? new Client()
							.setEndpoint(endpoint)
							.setProject(projectId)
							.setSession(session.secret)
					: new Client().setEndpoint(endpoint).setProject(projectId),
			);
		}
		const anonymous = await access(),
			a = await access("proof-a"),
			b = await access("proof-b"),
			c = await access("proof-c");
		async function canRead(tableId: string, rowId: string, reader: TablesDB) {
			try {
				await reader.getRow({ databaseId, tableId, rowId });
				return true;
			} catch (error) {
				if (
					(error as { code?: number }).code === 404 ||
					(error as { code?: number }).code === 401
				)
					return false;
				throw error;
			}
		}
		assert.equal(await canRead("posts", "proof-post-a", anonymous), true);
		assert.equal(await canRead("posts", "proof-post-b", anonymous), false);
		assert.equal(await canRead("posts", "proof-post-b", b), true);
		assert.equal(await canRead("posts", "proof-post-b", c), false);
		assert.equal(await canRead("posts", "proof-post-b", a), true);
		assert.equal(await canRead("messages", "proof-msg1", b), true);
		assert.equal(await canRead("messages", "proof-msg1", c), false);
		assert.equal(await canRead("signals", "proof-s", a), true);
		stage = "rebuild";
		const updated = structuredClone(source);
		updated.Post[0]!.title = "changed";
		updated.Message = [];
		const next = projectBusiness(updated, { config, uploaded });
		const rebuilt = await runImport({
			...options,
			rows: next.rows,
			snapshot: "synthetic-b",
			rebuild: true,
			frozen: true,
		});
		assert.ok(rebuilt.ok);
		assert.equal(await target.get("messages", "proof-msg1"), null);
		assert.equal((await target.list("message_conversations")).length, 0);
		await atomicPrivate(join(directory, "evidence.json"), {
			version: 1,
			result: "passed",
			source: "synthetic",
			users: identities.length,
			media: plan.assets.length,
			rows: projection.rows.length,
			interruptedMultipart: true,
			repeatUploadNoExtraVersions: true,
			exactReadbackVerified: true,
			acl: true,
			rebuild: true,
			archivePurge: "not_tested",
			appwrite: "2.6.2",
		});
		process.stdout.write(
			JSON.stringify({
				result: "passed",
				users: 3,
				assets: plan.assets.length,
				rows: projection.rows.length,
				archivePurge: "not_tested",
			}) + "\n",
		);
	} catch (error) {
		process.stderr.write(
			`synthetic_proof_failed stage=${stage} type=${error instanceof Error ? error.name : "unknown"}\n`,
		);
		process.exitCode = 1;
	} finally {
		if (uploadAttempted) {
			try {
				await cleanupUploadedMedia(plan, client, uploadOptions.checkpointPath);
				const v = await client.send(
					new ListObjectVersionsCommand({
						Bucket: plan.bucket,
						Prefix: plan.prefix,
					}),
				);
				const u = await client.send(
					new ListMultipartUploadsCommand({
						Bucket: plan.bucket,
						Prefix: plan.prefix,
					}),
				);
				assert.equal(v.IsTruncated, false);
				assert.equal(u.IsTruncated, false);
				assert.equal(
					(v.Versions?.length ?? 0) +
						(v.DeleteMarkers?.length ?? 0) +
						(u.Uploads?.length ?? 0),
					0,
				);
				const evidencePath = join(directory, "evidence.json");
				if (await Bun.file(evidencePath).exists()) {
					const evidence = await Bun.file(evidencePath).json();
					await atomicPrivate(evidencePath, {
						...evidence,
						storageCleanup: "verified",
					});
				}
				process.stdout.write("synthetic_storage_cleanup_verified\n");
			} catch {
				process.stderr.write("synthetic_storage_cleanup_failed\n");
				process.exitCode = 1;
			}
		}
	}
}
if (import.meta.main) {
	try {
		await main();
	} catch {
		process.stderr.write("synthetic_proof_setup_failed\n");
		process.exitCode = 1;
	}
}
