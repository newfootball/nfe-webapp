import assert from "node:assert/strict";
import { chmod, open } from "node:fs/promises";
import { resolve } from "node:path";
import {
	AbortMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetBucketAclCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Client, Permission, Role, TablesDB, Users } from "node-appwrite";
import { isOwnerOnlyBucketAcl } from "../src/lib/media-policy";
import { databaseId, fixtures } from "./moderation-fixtures";
import { endpoint, state } from "./moderation-local";

// prepare/up/down are deliberately separate moderation-local commands. Never target a remote Appwrite.
async function main() {
	assert.equal(process.env.NFE_ACCOUNT_DELETION_SYNTHETIC, "1");
	assert.equal(endpoint, "http://127.0.0.1:18160/v1");
	const node = Bun.spawn(["node", "--version"], {
		stdout: "pipe",
		stderr: "ignore",
		timeout: 3000,
	});
	assert.equal(await node.exited, 0);
	assert.match(
		(await new Response(node.stdout).text()).trim(),
		/^v24\./,
		"Node24 required for the browser runner",
	);
	assert(await Bun.file(`${state}/compose.json`).exists());
	const { c, fixture } = await fixtures();
	const keys = c as typeof c & {
		accountKey: string;
		notificationKey: string;
		lifecycleKey: string;
	};
	assert(keys.accountKey && keys.notificationKey && keys.lifecycleKey);
	assert.equal(
		new Set([
			keys.accountKey,
			keys.notificationKey,
			keys.lifecycleKey,
			c.writerKey,
			c.readerKey,
			c.sessionKey,
			c.proofKey,
		]).size,
		7,
	);
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const directory = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provisionMessaging } = await import(`${directory}/messaging.mts`);
	const { provisionNotificationV1 } = await import(
		`${directory}/notification-v1.mts`
	);
	const { provisionLifecycleV1 } = await import(
		`${directory}/lifecycle-v1.mts`
	);
	const { provisionAccountLifecycleV1 } = await import(
		`${directory}/account-lifecycle-v1.mts`
	);
	await provisionMessaging(db, databaseId);
	await provisionNotificationV1(db, databaseId);
	await provisionLifecycleV1(db, databaseId);
	await provisionAccountLifecycleV1(db, databaseId);
	const allowed = [
		"B2_APPLICATION_KEY_ID",
		"B2_APPLICATION_KEY",
		"B2_BUCKET_NAME",
		"B2_BUCKET_ID",
		"B2_REGION",
		"B2_ENDPOINT",
	] as const;
	const b2: Record<string, string> = {};
	for (const line of (
		await Bun.file(
			"/Users/faharihamadasidi/Sites/github.com/newfootball/nfe-webapp/.env.local",
		).text()
	).split(/\r?\n/)) {
		const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (!match || !allowed.includes(match[1] as (typeof allowed)[number]))
			continue;
		let value = match[2] ?? "";
		if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
		else if (value.startsWith("'") && value.endsWith("'"))
			value = value.slice(1, -1);
		else value = value.replace(/\s+#.*$/, "");
		b2[match[1]!] = value;
	}
	assert(allowed.every((key) => b2[key]));
	assert.equal(b2.B2_BUCKET_NAME, "nfe-webapp-dev");
	assert.equal(b2.B2_REGION, "eu-central-003");
	assert.equal(b2.B2_ENDPOINT, "https://s3.eu-central-003.backblazeb2.com");
	const s3 = new S3Client({
		region: b2.B2_REGION,
		endpoint: b2.B2_ENDPOINT,
		credentials: {
			accessKeyId: b2.B2_APPLICATION_KEY_ID!,
			secretAccessKey: b2.B2_APPLICATION_KEY!,
		},
	});
	assert(
		isOwnerOnlyBucketAcl(
			await s3.send(new GetBucketAclCommand({ Bucket: b2.B2_BUCKET_NAME })),
		),
	);
	const prefix = `account-deletion-proof/${crypto.randomUUID()}/`;
	const assetIds = [
		"account-proof-ready",
		"account-proof-multipart",
		"account-proof-foreign",
		"account-proof-ambiguous",
		"account-proof-shared",
		"account-proof-post",
		"account-proof-unattached",
	];
	const objectKeys = assetIds.map((id) => `${prefix}${id}`);
	const manifestPath = `${state}/account-proof-manifest.json`;
	const file = await open(manifestPath, "wx", 0o600);
	await file.writeFile(
		JSON.stringify({ prefix, bucket: b2.B2_BUCKET_NAME, keys: objectKeys }),
	);
	await file.close();
	const [a, b] = fixture.actors;
	assert(a && b);
	const users = new Users(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const blockedId = "account-proof-blocked";
	const sharedId = "account-proof-shared-owner";
	const blockedPassword = `Synthetic-${crypto.randomUUID()}-Aa1!`;
	await users.create({
		userId: blockedId,
		email: `${blockedId}@example.test`,
		password: blockedPassword,
		name: "Blocked proof",
	});
	const blockedSession = await users.createSession({ userId: blockedId });
	fixture.actors.push({
		id: blockedId,
		password: blockedPassword,
		secret: blockedSession.secret,
	});
	await Bun.write(`${state}/fixture.json`, JSON.stringify(fixture));
	await chmod(`${state}/fixture.json`, 0o600);
	await db.createRow({
		databaseId,
		tableId: "profiles",
		rowId: blockedId,
		permissions: [Permission.read(Role.any())],
		data: {
			name: "Blocked proof",
			nameFolded: "blocked proof",
			image: null,
			biography: null,
			localisation: "Paris",
			position: [],
			foot: [],
			userType: "USER",
			isOnboarded: true,
			createdAt: new Date().toISOString(),
			updatedAt: null,
		},
	});
	await db.createRow({
		databaseId,
		tableId: "private_profiles",
		rowId: blockedId,
		permissions: [Permission.read(Role.user(blockedId))],
		data: { role: "USER" },
	});
	const sharedPassword = `Synthetic-${crypto.randomUUID()}-Aa1!`;
	await users.create({
		userId: sharedId,
		email: `${sharedId}@example.test`,
		password: sharedPassword,
		name: "Shared proof",
	});
	const sharedSession = await users.createSession({ userId: sharedId });
	fixture.actors.push({
		id: sharedId,
		password: sharedPassword,
		secret: sharedSession.secret,
	});
	await Bun.write(`${state}/fixture.json`, JSON.stringify(fixture));
	await chmod(`${state}/fixture.json`, 0o600);
	await db.createRow({
		databaseId,
		tableId: "profiles",
		rowId: sharedId,
		permissions: [Permission.read(Role.any())],
		data: {
			name: "Shared proof",
			nameFolded: "shared proof",
			image: null,
			biography: null,
			localisation: "Paris",
			position: [],
			foot: [],
			userType: "USER",
			isOnboarded: true,
			createdAt: new Date().toISOString(),
			updatedAt: null,
		},
	});
	await db.createRow({
		databaseId,
		tableId: "private_profiles",
		rowId: sharedId,
		permissions: [Permission.read(Role.user(sharedId))],
		data: { role: "USER" },
	});
	const now = new Date().toISOString();
	const ref = (tableId: string, rowId: string) => ({
		databaseId,
		tableId,
		rowId,
	});
	let server: ReturnType<typeof Bun.spawn> | undefined;
	let tests: ReturnType<typeof Bun.spawn> | undefined;
	let success = false;
	try {
		for (let i = 0; i < objectKeys.length; i++) {
			const key = objectKeys[i]!;
			const owner =
				i === 2 ? b.id : i === 3 ? blockedId : i === 4 ? sharedId : a.id;
			let uploadId: string | undefined;
			let versionId: string | undefined;
			if (i === 3) {
				// An unfinished initialization is ambiguous and must block completion.
			} else if (i === 1) {
				await s3.send(
					new PutObjectCommand({
						Bucket: b2.B2_BUCKET_NAME,
						Key: key,
						Body: "multipart-prior-version",
					}),
				);
				uploadId = (
					await s3.send(
						new CreateMultipartUploadCommand({
							Bucket: b2.B2_BUCKET_NAME,
							Key: key,
							ContentType: "application/octet-stream",
						}),
					)
				).UploadId;
				assert(uploadId);
			} else {
				await s3.send(
					new PutObjectCommand({
						Bucket: b2.B2_BUCKET_NAME,
						Key: key,
						Body: "account-proof-first",
					}),
				);
				versionId = (
					await s3.send(
						new PutObjectCommand({
							Bucket: b2.B2_BUCKET_NAME,
							Key: key,
							Body: "account-proof-second",
						}),
					)
				).VersionId;
				assert(versionId);
			}
			await db.createRow({
				...ref("media_assets", assetIds[i]!),
				permissions: [],
				data: {
					ownerId: owner,
					kind: i === 0 ? "avatar" : "thumbnail",
					state:
						i === 0 || i === 5
							? "ATTACHED"
							: i === 3
								? "INITIALIZING"
								: i === 1
									? "UPLOADING"
									: "READY",
					provider: "B2",
					bucket: b2.B2_BUCKET_NAME,
					objectKey: key,
					uploadId: uploadId ?? null,
					versionId: versionId ?? null,
					byteSize: 20,
					sha256: "a".repeat(64),
					mimetype: "application/octet-stream",
					postId: i === 5 ? "social-second" : null,
					metadataJson: null,
					createdAt: now,
					updatedAt: now,
				},
			});
			if (i === 5)
				await db.createRow({
					...ref("media", assetIds[i]!),
					permissions: [],
					data: {
						postId: "social-second",
						type: "mainVideo",
						mimetype: "application/octet-stream",
						filename: null,
						label: null,
						metadataJson: null,
						createdAt: now,
						updatedAt: now,
						provider: "B2",
						bucket: b2.B2_BUCKET_NAME,
						objectKey: key,
						versionId,
						byteSize: 20,
						checksum: "a".repeat(64),
						ownerId: a.id,
						state: "READY",
					},
				});
		}
		await db.updateRow({
			...ref("profiles", a.id),
			data: { image: `/media/${assetIds[0]}` },
		});
		const common = { createdAt: now, updatedAt: now };
		for (const [id, fromUserId, toUserId] of [
			["acct-sent", a.id, b.id],
			["acct-received", b.id, a.id],
			["acct-foreign", b.id, fixture.actors[2]!.id],
		] as const)
			await db.createRow({
				...ref("messages", id),
				permissions: [],
				data: {
					fromUserId,
					toUserId,
					content: `proof ${id}`,
					readAt: null,
					...common,
				},
			});
		await db.createRow({
			...ref("message_conversations", "acct-conversation"),
			permissions: [],
			data: {
				participantA: a.id,
				participantB: b.id,
				latestId: "acct-sent",
				latestAt: now,
			},
		});
		await db.createRow({
			...ref("message_limits", "acct-limit"),
			permissions: [],
			data: { senderId: a.id, window: 1, count: 1 },
		});
		await db.createRow({
			...ref("follows", "acct-follow"),
			permissions: [],
			data: { followerId: b.id, followingId: a.id, ...common },
		});
		await db.createRow({
			...ref("follows", "acct-follow-reverse"),
			permissions: [],
			data: { followerId: a.id, followingId: b.id, ...common },
		});
		for (const table of ["likes", "favorites", "comments", "signals"]) {
			await db.createRow({
				...ref(table, `acct-${table}`),
				permissions: [],
				data: {
					userId: a.id,
					postId: "social-public",
					...common,
					...(table === "comments" ? { content: "private comment" } : {}),
					...(table === "signals"
						? { reason: "OTHER", details: "private detail", status: "PENDING" }
						: {}),
				},
			});
		}
		for (const [id, actorId, recipientId] of [
			["acct-event-out", a.id, b.id],
			["acct-event-in", b.id, a.id],
		] as const) {
			const event = {
				eventId: id,
				type: "MESSAGE",
				actorId,
				recipientId,
				targetId: "acct-sent",
				entityId: "acct-sent",
				occurredAt: now,
				source: "business",
			};
			await db.createRow({
				...ref("notifications_v1", id),
				permissions: [],
				data: { ...event, readAt: null },
			});
			await db.createRow({
				...ref("notification_outbox_v1", id),
				permissions: [],
				data: {
					...event,
					status: "PENDING",
					attempts: 0,
					nextAttemptAt: now,
					claim: null,
					leaseUntil: null,
					deliveredAt: null,
				},
			});
			await db.createRow({
				...ref("notification_recovery_v1", id),
				permissions: [],
				data: {
					outboxId: id,
					reason: "proof",
					recoveredAt: now,
					priorAttempts: 1,
				},
			});
		}
		await db.createRow({
			...ref("account_lifecycle_anchors", a.id),
			permissions: [],
			data: { state: "ACTIVE", operationId: null, updatedAt: now },
		});
		await Bun.write(
			`${state}/account-proof.json`,
			JSON.stringify({
				prefix,
				keys: objectKeys,
				assetIds,
				operationId: crypto.randomUUID(),
			}),
		);
		await chmod(`${state}/account-proof.json`, 0o600);
		const env: Record<string, string> = {
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			HOME: process.env.HOME ?? "",
			NODE_ENV: "production",
			PORT: "3574",
			NFE_ACCOUNT_DELETION_SYNTHETIC: "1",
			START_APP_ORIGIN: "http://127.0.0.1:3574",
			START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
			START_APPWRITE_ENDPOINT: endpoint,
			START_APPWRITE_PROJECT: c.project,
			START_APPWRITE_DATABASE: databaseId,
			START_APPWRITE_SESSION_KEY: c.sessionKey,
			START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY: keys.accountKey,
			START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
			START_APPWRITE_POST_TEXT_WRITER_KEY: c.writerKey,
			START_APPWRITE_INTERACTION_WRITER_KEY: c.writerKey,
			START_APPWRITE_MODERATION_WRITER_KEY: c.writerKey,
			START_APPWRITE_MODERATION_READER_KEY: c.readerKey,
			START_APPWRITE_FEED_READER_KEY: c.readerKey,
			START_APPWRITE_MEDIA_READER_KEY: c.readerKey,
			START_APPWRITE_MESSAGING_WRITER_KEY: c.writerKey,
			START_APPWRITE_NOTIFICATION_WRITER_KEY: keys.notificationKey,
			START_APPWRITE_LIFECYCLE_WRITER_KEY: keys.lifecycleKey,
			START_MEDIA_PREFIX: prefix,
			START_MEDIA_READ_TTL_SECONDS: "3",
			START_LIFECYCLE_SYNTHETIC_PROJECT: c.project,
			START_LIFECYCLE_SYNTHETIC_PREFIX: prefix,
			START_ACCOUNT_DELETION_SYNTHETIC_PROJECT: c.project,
			...b2,
		};
		if (process.env.PLAYWRIGHT_CHANNEL)
			env.PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL;
		for (const phase of ["normal", "version-crash", "auth-crash", "recovery"]) {
			const phaseEnv = {
				...env,
				START_ACCOUNT_DELETION_FAILURE_POINT:
					phase === "version-crash"
						? "crash:after-version-delete"
						: phase === "auth-crash"
							? "crash:after-auth-delete"
							: "",
			};
			const log = `${state}/account-server-${phase}.log`,
				out = `${state}/account-playwright-${phase}.log`;
			for (const path of [log, out]) {
				await Bun.write(path, "");
				await chmod(path, 0o600);
			}
			server = Bun.spawn(["bun", "server.ts"], {
				cwd: `${import.meta.dir}/..`,
				env: phaseEnv,
				stdout: Bun.file(log),
				stderr: Bun.file(log),
			});
			let ready = false;
			for (let i = 0; i < 100; i++) {
				try {
					if (
						(
							await fetch("http://127.0.0.1:3574/en/about", {
								signal: AbortSignal.timeout(2000),
							})
						).ok
					) {
						ready = true;
						break;
					}
				} catch {}
				if (server.exitCode !== null)
					throw new Error("Account proof server exited");
				await Bun.sleep(250);
			}
			assert(ready);
			tests = Bun.spawn(
				[
					"bun",
					"x",
					"--no-install",
					"playwright",
					"test",
					"--config",
					"playwright.account-deletion.config.ts",
					"--grep",
					`${phase}:`,
				],
				{
					cwd: `${import.meta.dir}/..`,
					env: phaseEnv,
					stdout: Bun.file(out),
					stderr: Bun.file(out),
				},
			);
			let timer: ReturnType<typeof setTimeout> | undefined;
			let exit: number;
			try {
				exit = await Promise.race([
					tests.exited,
					new Promise<never>((_, reject) => {
						timer = setTimeout(
							() => reject(new Error("Proof deadline exceeded")),
							1_200_000,
						);
					}),
				]);
			} finally {
				clearTimeout(timer);
			}
			tests = undefined;
			assert.equal(
				exit,
				0,
				`Account proof ${phase} failed; private log retained`,
			);
			if (phase.endsWith("-crash"))
				assert.equal(await server.exited, 86, "Expected actual server crash");
			else if (server.exitCode === null) {
				server.kill();
				await server.exited;
			}
			server = undefined;
		}

		success = true;
	} finally {
		if (tests && tests.exitCode === null) {
			tests.kill();
			await tests.exited;
		}
		if (server && server.exitCode === null) {
			server.kill();
			await server.exited;
		}
		// Inventory exact owned keys from the durable pre-write manifest, including uploads whose creation response was lost.
		const cleanupErrors: string[] = [];
		for (const key of objectKeys) {
			try {
				assert(
					key.startsWith(prefix) &&
						assetIds.some((id) => key === `${prefix}${id}`),
				);
				const versions = await s3.send(
					new ListObjectVersionsCommand({
						Bucket: b2.B2_BUCKET_NAME,
						Prefix: key,
						MaxKeys: 100,
					}),
				);
				assert(!versions.IsTruncated);
				for (const version of [
					...(versions.Versions ?? []),
					...(versions.DeleteMarkers ?? []),
				]) {
					if (version.Key !== key) continue;
					assert(version.VersionId);
					await s3.send(
						new DeleteObjectCommand({
							Bucket: b2.B2_BUCKET_NAME,
							Key: key,
							VersionId: version.VersionId,
						}),
					);
				}
				const uploads = await s3.send(
					new ListMultipartUploadsCommand({
						Bucket: b2.B2_BUCKET_NAME,
						Prefix: key,
						MaxUploads: 100,
					}),
				);
				assert(!uploads.IsTruncated);
				for (const upload of uploads.Uploads ?? []) {
					if (upload.Key !== key) continue;
					assert(upload.UploadId);
					await s3.send(
						new AbortMultipartUploadCommand({
							Bucket: b2.B2_BUCKET_NAME,
							Key: key,
							UploadId: upload.UploadId,
						}),
					);
				}
				const remainingVersions = await s3.send(
					new ListObjectVersionsCommand({
						Bucket: b2.B2_BUCKET_NAME,
						Prefix: key,
						MaxKeys: 100,
					}),
				);
				const remainingUploads = await s3.send(
					new ListMultipartUploadsCommand({
						Bucket: b2.B2_BUCKET_NAME,
						Prefix: key,
						MaxUploads: 100,
					}),
				);
				assert(!remainingVersions.IsTruncated && !remainingUploads.IsTruncated);
				assert(
					![
						...(remainingVersions.Versions ?? []),
						...(remainingVersions.DeleteMarkers ?? []),
					].some((v) => v.Key === key),
				);
				assert(!(remainingUploads.Uploads ?? []).some((u) => u.Key === key));
			} catch {
				cleanupErrors.push(key);
			}
		}
		s3.destroy();
		assert.equal(
			cleanupErrors.length,
			0,
			"Exact-key cleanup incomplete; consult private manifest",
		);
	}
	assert(success);
	process.stdout.write(
		"Account proof completed; private diagnostics retained.\n",
	);
}
main().catch(() => {
	process.stderr.write(
		"Account proof failed; inspect private diagnostics and manifest.\n",
	);
	process.exitCode = 1;
});
