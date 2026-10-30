import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { databaseId } from "../scripts/post-lifecycle-fixtures";
import { endpoint, state } from "../scripts/post-lifecycle-local";
import type { UploadAsset } from "../src/lib/media-contract";
import { storage } from "../src/lib/media-storage.server";
import type { LifecycleProgress } from "../src/lib/post-lifecycle-contract";
import {
	assertLifecycleLease,
	fencedLifecycleCheckpoint,
} from "../src/lib/post-lifecycle-db.server";
import type { OwnPost, PostTextResult } from "../src/lib/post-text-contract";

const root = dirname(fileURLToPath(import.meta.url)),
	origin = "http://127.0.0.1:3556";
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8"));
const db = new TablesDB(
	new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
);
const parentRef = (id: string) => ({ databaseId, tableId: "posts", rowId: id });
const rowRef = (tableId: string, rowId: string) => ({
	databaseId,
	tableId,
	rowId,
});
const ids = new Map<string, string>();
async function rpcURL(name: string) {
	if (!ids.has(name))
		for (const file of await readdir(`${root}/../dist/server/assets`)) {
			const code = await readFile(
					`${root}/../dist/server/assets/${file}`,
					"utf8",
				),
				start = code.indexOf(`var ${name} = createServerFn(`);
			const match =
				start < 0
					? null
					: code.slice(start).match(/createSsrRpc\("([a-f0-9]+)"/);
			if (match?.[1]) {
				ids.set(name, match[1]);
				break;
			}
		}
	if (!ids.has(name)) throw new Error(`Missing RPC ${name}`);
	return `${origin}/_serverFn/${ids.get(name)}`;
}
async function call<T>(
	request: APIRequestContext,
	name: string,
	data: unknown,
	actor = 0,
	get = false,
	extra: Record<string, string> = {},
): Promise<PostTextResult<T>> {
	const url = new URL(await rpcURL(name)),
		payload = JSON.stringify(toJSON({ data }));
	if (get) url.searchParams.set("payload", payload);
	const response = await request.fetch(url.toString(), {
		method: get ? "GET" : "POST",
		headers: {
			"x-tsr-serverfn": "true",
			"content-type": "application/json",
			Accept: "application/json",
			Origin: origin,
			"sec-fetch-site": "same-origin",
			...(actor >= 0
				? {
						Cookie: `nfe-session-dev=${encodeURIComponent(fixture.actors[actor].secret)}`,
					}
				: {}),
			...extra,
		},
		...(get ? {} : { data: payload }),
	});
	expect(response.headers()["cache-control"]).toBe("private, no-store");
	const envelope = fromCrossJSON(JSON.parse(await response.text()), {}) as {
		result: PostTextResult<T>;
		error?: unknown;
	};
	expect(Boolean(envelope.error)).toBe(false);
	return envelope.result;
}
function value<T>(result: PostTextResult<T>) {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(`Controlled lifecycle ${result.error}`);
	return result.value;
}
const own = async (request: APIRequestContext, id: string) =>
	value(await call<OwnPost>(request, "getOwnPost", { id }, 0, true));
const base = (post: OwnPost) => ({
	id: post.id,
	expectedRevision: post.revision,
});
const snapshot = (p: Record<string, unknown>) => [
	p.$id,
	p.userId,
	p.slug,
	p.title,
	p.description,
	p.type,
	p.createdAt,
	p.publishedAt,
	p.expiresAt,
	p.validatedAt,
];
const privateACL = [
	Permission.read(Role.user(fixture.actors[0].id)),
	Permission.read(Role.label("admin")),
];
async function seed(
	status: string | null = "PUBLISHED",
	id = `social-lifecycle-${crypto.randomUUID().slice(0, 18)}`,
) {
	await db.createRow({
		...parentRef(id),
		permissions:
			status === "PUBLISHED" ? [Permission.read(Role.any())] : privateACL,
		data: {
			userId: fixture.actors[0].id,
			slug: `stable-${id}`,
			title: `Lifecycle ${id}`,
			description: "Synthetic lifecycle",
			titleFolded: "lifecycle",
			descriptionFolded: "synthetic lifecycle",
			type: "video",
			status,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
			publishedAt: null,
			expiresAt: null,
			validatedAt: null,
		},
	});
	return id;
}
async function upload(request: APIRequestContext, kind: "video" | "thumbnail") {
	const bytes = new Uint8Array(
			await readFile(
				`${state}/${kind === "video" ? "video.mp4" : "thumbnail.webp"}`,
			),
		),
		requestId = crypto.randomUUID();
	const asset = value(
		await call<UploadAsset>(request, "allocateAsset", {
			requestId,
			kind,
			byteSize: bytes.length,
			sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
			mimetype: kind === "video" ? "video/mp4" : "image/webp",
		}),
	);
	for (let n = 0; n < Math.ceil(bytes.length / asset.partBytes); n++) {
		const signed = value(
			await call<{ url: string }>(request, "signAssetPart", {
				assetId: asset.id,
				partNumber: n + 1,
			}),
		);
		const result = await request.put(signed.url, {
			data: Buffer.from(
				bytes.slice(n * asset.partBytes, (n + 1) * asset.partBytes),
			),
		});
		expect(result.ok()).toBe(true);
	}
	const ready = value(
		await call<UploadAsset>(request, "finalizeAsset", { assetId: asset.id }),
	);
	expect(ready.state).toBe("READY");
	return ready.id;
}
async function published(request: APIRequestContext) {
	const videoId = await upload(request, "video"),
		thumbnailId = await upload(request, "thumbnail"),
		requestId = crypto.randomUUID();
	const post = value(
		await call<{ id: string }>(request, "publishPost", {
			requestId,
			videoId,
			thumbnailId,
			title: "Synthetic lifecycle video",
			description: "Lifecycle fixture",
		}),
	);
	return { ...post, videoId, thumbnailId };
}
async function finish(request: APIRequestContext, operationId: string) {
	let progress: LifecycleProgress = {
		operationId,
		done: false,
		phase: "START",
	};
	for (let n = 0; n < 100 && !progress.done; n++)
		progress = value(
			await call<LifecycleProgress>(request, "continuePostLifecycle", {
				operationId,
			}),
		);
	expect(progress.done).toBe(true);
	return progress;
}
async function remove(request: APIRequestContext, id: string) {
	const p = await own(request, id);
	return value(
		await call<LifecycleProgress>(request, "removePost", {
			...base(p),
			requestId: crypto.randomUUID(),
		}),
	);
}
async function noSignature(request: APIRequestContext, id: string) {
	expect((await call(request, "readAsset", { assetId: id }, 0, true)).ok).toBe(
		false,
	);
}
async function count(tableId: string, id: string) {
	return (
		await db.listRows({
			databaseId,
			tableId,
			queries: [Query.equal("postId", id), Query.limit(1)],
			total: true,
		})
	).total;
}
async function control(
	request: APIRequestContext,
	method: string,
	data?: unknown,
) {
	return request.fetch(process.env.NFE_LIFECYCLE_PROXY_CONTROL!, {
		method,
		headers: { "x-proof-token": process.env.NFE_LIFECYCLE_PROXY_TOKEN! },
		...(data ? { data } : {}),
	});
}

test("normal: owner transitions, exact ACL, business dates, invalid and third-party direct RPC", async ({
	request,
}) => {
	for (const status of [
		"DRAFT",
		"PUBLISHED",
		"PENDING",
		"REJECTED",
		"ARCHIVED",
		null,
	]) {
		const id = await seed(status),
			before = await db.getRow(parentRef(id)),
			p = await own(request, id),
			target = status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED";
		for (const actor of [-1, 1, 3])
			expect(
				(await call(request, "changePostStatus", { ...base(p), target }, actor))
					.ok,
			).toBe(false);
		for (const fields of [
			{ ownerId: fixture.actors[0].id },
			{ role: "admin" },
			{ status: "PUBLISHED" },
			{ publishedAt: "2026-01-03" },
		])
			expect(
				(
					await call(request, "changePostStatus", {
						...base(p),
						target,
						...fields,
					})
				).ok,
			).toBe(false);
		expect(
			(
				await call(
					request,
					"changePostStatus",
					{ ...base(p), target },
					0,
					false,
					{ Origin: "https://hostile.example" },
				)
			).ok,
		).toBe(false);
		const result = await call(request, "changePostStatus", {
			...base(p),
			target,
		});
		expect(result.ok).toBe(status === "DRAFT" || status === "PUBLISHED");
		const after = await db.getRow(parentRef(id));
		expect(snapshot(after)).toEqual(snapshot(before));
		if (result.ok) {
			expect(after.status).toBe(target);
			expect(after.$permissions.toSorted()).toEqual(
				(target === "PUBLISHED"
					? [Permission.read(Role.any())]
					: privateACL
				).toSorted(),
			);
			expect(
				(await call(request, "changePostStatus", { ...base(p), target })).ok,
			).toBe(false);
		} else expect(after.$permissions).toEqual(before.$permissions);
	}
});

test("normal: archive old links, private preview and actual residual signed TTL", async ({
	request,
}) => {
	const post = await published(request),
		p = await own(request, post.id),
		signed = value(
			await call<{ url: string; expiresAt: number }>(
				request,
				"readPostMedia",
				{ postId: post.id, kind: "video" },
				-1,
				true,
			),
		);
	expect(
		(
			await request.get(signed.url, { headers: { Range: "bytes=0-15" } })
		).status(),
	).toBe(206);
	value(
		await call(request, "changePostStatus", { ...base(p), target: "ARCHIVED" }),
	);
	for (const path of [
		`/post/${post.id}`,
		`/en/post/${post.id}`,
		`/fr/post/${post.id}`,
	]) {
		const r = await request.get(`${origin}${path}`);
		expect(r.status()).toBe(404);
	}
	expect(
		(
			await call(
				request,
				"readPostMedia",
				{ postId: post.id, kind: "video" },
				-1,
				true,
			)
		).ok,
	).toBe(false);
	expect(
		(await call(request, "readAsset", { assetId: post.videoId }, -1, true)).ok,
	).toBe(false);
	expect(
		(await call(request, "readAsset", { assetId: post.videoId }, 0, true)).ok,
	).toBe(true);
	const first = (
		await request.get(signed.url, { headers: { Range: "bytes=0-15" } })
	).status();
	expect([206, 403]).toContain(first);
	await new Promise((resolve) =>
		setTimeout(resolve, Math.max(0, signed.expiresAt - Date.now()) + 1500),
	);
	const expired = await request.get(signed.url, {
		headers: { Range: "bytes=0-15" },
	});
	expect(expired.status()).toBe(403);
	await Bun.write(
		`${state}/ttl-proof.json`,
		JSON.stringify({
			configuredSeconds: 3,
			firstStatus: first,
			expiredStatus: expired.status(),
			measuredAfterExpiresMs: Date.now() - signed.expiresAt,
			cachePolicy: "private,no-store; no CDN claim",
		}),
	);
	const op = await remove(request, post.id);
	await noSignature(request, post.videoId);
	await finish(request, op.operationId);
});

test("normal: atomic replacement, exact versions/hash, reference protection and multiple child pages", async ({
	request,
}) => {
	const p = await published(request),
		before = await db.getRow(parentRef(p.id)),
		old = await db.getRow(rowRef("media_assets", p.videoId)),
		{ s3 } = storage();
	try {
		// A second real synthetic version is deliberately inventoried and purged with its exact ID.
		const bytes = await readFile(`${state}/video.mp4`);
		await s3.send(
			new PutObjectCommand({
				Bucket: old.bucket,
				Key: old.objectKey,
				Body: bytes,
				ContentType: "video/mp4",
			}),
		);
		const videoId = await upload(request, "video"),
			thumbnailId = await upload(request, "thumbnail"),
			post = await own(request, p.id),
			payload = {
				...base(post),
				requestId: crypto.randomUUID(),
				videoId,
				thumbnailId,
			};
		for (const actor of [1, 3])
			expect((await call(request, "changePostMedia", payload, actor)).ok).toBe(
				false,
			);
		const op = value(
			await call<LifecycleProgress>(request, "changePostMedia", payload),
		);
		expect(
			value(await call<LifecycleProgress>(request, "changePostMedia", payload))
				.operationId,
		).toBe(op.operationId);
		expect(snapshot(await db.getRow(parentRef(p.id)))).toEqual(
			snapshot(before),
		);
		await noSignature(request, p.videoId);
		for (const id of [videoId, thumbnailId]) {
			const a = await db.getRow(rowRef("media_assets", id)),
				m = await db.getRow(rowRef("media", id));
			expect(a.state).toBe("ATTACHED");
			expect(a.postId).toBe(p.id);
			expect(m.versionId).toBe(a.versionId);
			const object = await s3.send(
				new GetObjectCommand({
					Bucket: a.bucket,
					Key: a.objectKey,
					VersionId: a.versionId,
				}),
			);
			expect(
				new Bun.CryptoHasher("sha256")
					.update(await object.Body!.transformToByteArray())
					.digest("hex"),
			).toBe(a.sha256);
		}
		const sharedId = crypto.randomUUID(),
			sharedPost = await seed();
		await db.createRow({
			...rowRef("media", sharedId),
			permissions: [],
			data: {
				postId: sharedPost,
				type: "mainVideo",
				mimetype: old.mimetype,
				metadataJson: old.metadataJson,
				createdAt: old.createdAt,
				updatedAt: old.updatedAt,
				provider: "B2",
				bucket: old.bucket,
				objectKey: old.objectKey,
				versionId: old.versionId,
				byteSize: old.byteSize,
				checksum: old.sha256,
				ownerId: old.ownerId,
				state: "READY",
			},
		});
		expect(
			(
				await call(request, "continuePostLifecycle", {
					operationId: op.operationId,
				})
			).ok,
		).toBe(false);
		expect(
			(
				await s3.send(
					new HeadObjectCommand({
						Bucket: old.bucket,
						Key: old.objectKey,
						VersionId: old.versionId,
					}),
				)
			).VersionId,
		).toBe(old.versionId);
		await db.deleteRow(rowRef("media", sharedId));
		await finish(request, op.operationId);
		for (const tableId of ["likes", "comments", "favorites", "signals"])
			for (let n = 0; n < 43; n++)
				await db.createRow({
					...rowRef(tableId, crypto.randomUUID()),
					permissions: [],
					data: {
						postId: p.id,
						userId: `synthetic-${n}`,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						...(tableId === "comments" ? { content: "Synthetic child" } : {}),
						...(tableId === "signals"
							? { reason: "OTHER", details: "Synthetic", status: "PENDING" }
							: {}),
					},
				});
		const deletion = await remove(request, p.id);
		await noSignature(request, videoId);
		for (const tableId of ["likes", "comments", "favorites", "signals"])
			expect(await count(tableId, p.id)).toBe(43);
		await finish(request, deletion.operationId);
		for (const tableId of [
			"likes",
			"comments",
			"favorites",
			"signals",
			"media",
			"media_assets",
		])
			expect(await count(tableId, p.id)).toBe(0);
		await expect(db.getRow(parentRef(p.id))).rejects.toMatchObject({
			code: 404,
		});
		expect(
			value(
				await call<LifecycleProgress>(request, "continuePostLifecycle", {
					operationId: deletion.operationId,
				}),
			).done,
		).toBe(true);
	} finally {
		s3.destroy();
	}
});

test("normal: social staged anchor cannot commit an orphan after owner deletion", async ({
	request,
}) => {
	const id = await seed(),
		post = await own(request, id);
	await control(request, "POST", {
		postId: id,
		phase: "commit",
		when: "before",
	});
	const social = call(
		request,
		"addComment",
		{ id, requestId: crypto.randomUUID(), content: "Must not survive delete" },
		1,
	);
	try {
		await expect
			.poll(async () =>
				Boolean((await (await control(request, "GET")).json()).hit),
			)
			.toBe(true);
		const op = value(
			await call<LifecycleProgress>(request, "removePost", {
				...base(post),
				requestId: crypto.randomUUID(),
			}),
		);
		await control(request, "DELETE");
		expect((await social).ok).toBe(false);
		await finish(request, op.operationId);
		expect(await count("comments", id)).toBe(0);
	} finally {
		await control(request, "DELETE");
	}
});

test("normal: owner FR EN controls, failure rollback, reload/back and identity change", async ({
	page,
	context,
	request,
}) => {
	const id = await seed("DRAFT");
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: fixture.actors[0].secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto(`/fr/post/${id}/edit`);
	await page
		.getByRole("button", { name: "Publier le brouillon", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Archiver", exact: true }),
	).toBeVisible();
	await page
		.locator("main")
		.getByRole("link", { name: "English", exact: true })
		.click();
	await page.getByRole("button", { name: "Archive", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Archive", exact: true }),
	).toHaveCount(0);
	await page.reload();
	await expect(page.getByText("Archived", { exact: true })).toBeVisible();
	await page.goBack();
	await page.reload();
	expect((await own(request, id)).status).toBe("ARCHIVED");
	await context.clearCookies();
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: fixture.actors[1].secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.reload();
	await expect(
		page.getByRole("button", {
			name: /^(Archive|Archiver|Delete post|Supprimer la publication)$/,
		}),
	).toHaveCount(0);
});

test("withdrawal-failure: durable denial before any purge and recovery after server restart", async ({
	request,
}) => {
	const post = await published(request),
		op = await remove(request, post.id);
	await noSignature(request, post.videoId);
	await noSignature(request, post.thumbnailId);
	expect(
		(
			await call(request, "continuePostLifecycle", {
				operationId: op.operationId,
			})
		).ok,
	).toBe(false);
	const journal = await db.getRow(
		rowRef("post_lifecycle_operations", op.operationId),
	);
	expect(journal.phase).toBe("CHILDREN");
	expect(journal.token).toBeNull();
	await Bun.write(
		`${state}/recovery-operation.json`,
		JSON.stringify({ post, operationId: op.operationId }),
	);
});

test("version-failure: interruption after exact version delete retains checkpoint", async ({
	request,
}) => {
	const saved = JSON.parse(
		await readFile(`${state}/recovery-operation.json`, "utf8"),
	);
	let failed = false;
	for (let n = 0; n < 20; n++) {
		const r = await call<LifecycleProgress>(request, "continuePostLifecycle", {
			operationId: saved.operationId,
		});
		if (!r.ok) {
			failed = true;
			break;
		}
	}
	expect(failed).toBe(true);
	const journal = await db.getRow(
		rowRef("post_lifecycle_operations", saved.operationId),
	);
	expect(journal.phase).toBe("OBJECTS");
	expect(journal.versionStep).toBe(0);
	await noSignature(request, saved.post.videoId);
});

test("recovery: restart resumes idempotently with expired lease fencing and no dangling refs", async ({
	request,
}) => {
	const saved = JSON.parse(
		await readFile(`${state}/recovery-operation.json`, "utf8"),
	);
	await db.updateRow({
		...rowRef("post_lifecycle_operations", saved.operationId),
		data: {
			token: crypto.randomUUID(),
			leaseUntil: new Date(Date.now() - 1000).toISOString(),
		},
	});
	const staleToken = crypto.randomUUID(),
		liveToken = crypto.randomUUID();
	await db.updateRow({
		...rowRef("post_lifecycle_operations", saved.operationId),
		data: {
			token: liveToken,
			leaseUntil: new Date(Date.now() + 60000).toISOString(),
		},
	});
	await expect(
		assertLifecycleLease(db, saved.operationId, staleToken),
	).rejects.toThrow();
	await expect(
		fencedLifecycleCheckpoint(db, saved.operationId, staleToken, {
			phase: "DONE",
		}),
	).rejects.toThrow();
	expect(
		(await db.getRow(rowRef("post_lifecycle_operations", saved.operationId)))
			.phase,
	).not.toBe("DONE");
	await db.updateRow({
		...rowRef("post_lifecycle_operations", saved.operationId),
		data: { leaseUntil: new Date(Date.now() - 1000).toISOString() },
	});
	await finish(request, saved.operationId);
	await noSignature(request, saved.post.videoId);
	for (const tableId of [
		"likes",
		"comments",
		"favorites",
		"signals",
		"media",
		"media_assets",
	])
		expect(await count(tableId, saved.post.id)).toBe(0);
	await expect(db.getRow(parentRef(saved.post.id))).rejects.toMatchObject({
		code: 404,
	});
});
