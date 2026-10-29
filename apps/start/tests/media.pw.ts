import { readdir } from "node:fs/promises";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
	type APIRequestContext,
	expect,
	type Page,
	test,
} from "@playwright/test";
import { Client, Query, TablesDB } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/media-local";
import type { MediaResult, UploadAsset } from "../src/lib/media-contract";
import { MEDIA_PART_BYTES } from "../src/lib/media-contract";
import { storage } from "../src/lib/media-storage.server";

const origin = "http://127.0.0.1:3555",
	databaseId = "media-proof";
const config = await Bun.file(`${state}/credentials.json`).json();
const fixture = await Bun.file(`${state}/fixture.json`).json();
const db = new TablesDB(
	new Client()
		.setEndpoint(endpoint)
		.setProject(config.project)
		.setKey(config.proofKey),
);
async function endpointFor(name: string) {
	for (const path of await readdir(
		`${import.meta.dir}/../dist/server/assets`,
	)) {
		const text = await Bun.file(
			`${import.meta.dir}/../dist/server/assets/${path}`,
		).text();
		const match = text.match(
			new RegExp(
				`var ${name} = createServerFn\\([\\s\\S]*?createSsrRpc\\("([a-f0-9]+)"`,
			),
		);
		if (match) return `${origin}/_serverFn/${match[1]}`;
	}
	throw new Error(`Built RPC missing: ${name}`);
}
async function call<T>(
	request: APIRequestContext,
	name: string,
	data: unknown,
	actor = 0,
	get = false,
): Promise<MediaResult<T>> {
	const url = new URL(await endpointFor(name));
	const payload = JSON.stringify(toJSON({ data }));
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
		},
		...(get ? {} : { data: payload }),
	});
	expect(response.headers()["cache-control"]).toBe("private, no-store");
	const envelope = fromCrossJSON(JSON.parse(await response.text()), {}) as {
		result: MediaResult<T>;
		error?: unknown;
	};
	expect(!!envelope.error).toBe(false);
	return envelope.result;
}
function value<T>(result: MediaResult<T>) {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error("Controlled media operation failed");
	return result.value;
}
const sha = (b: Uint8Array) =>
	new Bun.CryptoHasher("sha256").update(b).digest("hex");
async function allocate(
	request: APIRequestContext,
	bytes: Uint8Array,
	kind: string,
	actor = 0,
	requestId = crypto.randomUUID(),
) {
	return value(
		await call<UploadAsset>(
			request,
			"allocateAsset",
			{
				requestId,
				kind,
				byteSize: bytes.length,
				sha256: sha(bytes),
				mimetype: kind === "video" ? "video/mp4" : "image/webp",
			},
			actor,
		),
	);
}
async function uploadPart(
	page: Page,
	url: string,
	bytes: Uint8Array,
	abort = false,
) {
	return page.evaluate(
		async ({ url, base64, abort }) => {
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			return await new Promise<{
				status: number;
				aborted: boolean;
				progressed: boolean;
			}>((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				let progressed = false;
				xhr.open("PUT", url);
				xhr.upload.onprogress = (e) => {
					progressed ||= e.loaded > 0;
					if (abort && progressed) xhr.abort();
				};
				xhr.onload = () =>
					resolve({ status: xhr.status, aborted: false, progressed });
				xhr.onabort = () => resolve({ status: 0, aborted: true, progressed });
				xhr.onerror = () => reject(new Error("Direct upload failed"));
				xhr.send(bytes);
			});
		},
		{ url, base64: Buffer.from(bytes).toString("base64"), abort },
	);
}
async function upload(
	request: APIRequestContext,
	page: Page,
	bytes: Uint8Array,
	kind: string,
	actor = 0,
) {
	const asset = await allocate(request, bytes, kind, actor);
	for (let i = 0; i < Math.ceil(bytes.length / MEDIA_PART_BYTES); i++) {
		const signed = value(
			await call<{ url: string }>(
				request,
				"signAssetPart",
				{ assetId: asset.id, partNumber: i + 1 },
				actor,
			),
		);
		expect(
			(
				await uploadPart(
					page,
					signed.url,
					bytes.slice(i * MEDIA_PART_BYTES, (i + 1) * MEDIA_PART_BYTES),
				)
			).status,
		).toBe(200);
	}
	return value(
		await call<UploadAsset>(
			request,
			"finalizeAsset",
			{ assetId: asset.id },
			actor,
		),
	);
}
test("real private B2 multipart, owner guards, validation and atomic publication", async ({
	request,
	page,
}) => {
	await page.goto("/en/about");
	const video = new Uint8Array(
			await Bun.file(`${state}/video.mp4`).arrayBuffer(),
		),
		image = new Uint8Array(
			await Bun.file(`${state}/thumbnail.webp`).arrayBuffer(),
		);
	expect(video.length > MEDIA_PART_BYTES).toBe(true);
	const attemptId = crypto.randomUUID(),
		allocation = await allocate(request, video, "video", 0, attemptId);
	expect((await allocate(request, video, "video", 0, attemptId)).id).toBe(
		allocation.id,
	);
	for (const actor of [-1, 1, 2]) {
		for (const method of ["signAssetPart", "finalizeAsset", "cancelAsset"])
			expect(
				(
					await call(
						request,
						method,
						{
							assetId: allocation.id,
							...(method === "signAssetPart" ? { partNumber: 1 } : {}),
						},
						actor,
					)
				).ok,
			).toBe(false);
		expect(
			(
				await call(
					request,
					"readAsset",
					{ assetId: allocation.id },
					actor,
					true,
				)
			).ok,
		).toBe(false);
	}
	expect(
		(
			await call(
				request,
				"allocateAsset",
				{
					requestId: crypto.randomUUID(),
					kind: "video",
					byteSize: video.length,
					sha256: sha(video),
					mimetype: "video/mp4",
				},
				2,
			)
		).ok,
	).toBe(false);
	const first = value(
		await call<{ url: string }>(request, "signAssetPart", {
			assetId: allocation.id,
			partNumber: 1,
		}),
	);
	const interrupted = await uploadPart(
		page,
		first.url,
		video.slice(0, MEDIA_PART_BYTES),
		true,
	);
	expect(interrupted.aborted && interrupted.progressed).toBe(true);
	expect(
		(await uploadPart(page, first.url, video.slice(0, MEDIA_PART_BYTES)))
			.status,
	).toBe(200);
	const resumed = value(
		await call<UploadAsset>(request, "resumeAsset", { assetId: allocation.id }),
	);
	expect(resumed.parts.map((p) => p.number)).toEqual([1]);
	const last = value(
		await call<{ url: string }>(request, "signAssetPart", {
			assetId: allocation.id,
			partNumber: 2,
		}),
	);
	expect(
		(await uploadPart(page, last.url, video.slice(MEDIA_PART_BYTES))).status,
	).toBe(200);
	const ready = value(
		await call<UploadAsset>(request, "finalizeAsset", {
			assetId: allocation.id,
		}),
	);
	expect(ready.state).toBe("READY");
	expect(
		value(
			await call<UploadAsset>(request, "finalizeAsset", {
				assetId: allocation.id,
			}),
		).id,
	).toBe(ready.id);
	expect(
		(await uploadPart(page, first.url, video.slice(0, MEDIA_PART_BYTES)))
			.status === 200,
	).toBe(false);
	expect(
		(await call(request, "readAsset", { assetId: ready.id }, -1, true)).ok,
	).toBe(false);
	const thumbnail = await upload(request, page, image, "thumbnail");
	const publish = {
		requestId: crypto.randomUUID(),
		title: "Séquence équipe",
		description: "Synthetic media proof",
		videoId: ready.id,
		thumbnailId: thumbnail.id,
	};
	expect((await call(request, "publishPost", publish, 1)).ok).toBe(false);
	await db.updateTable({ databaseId, tableId: "media", enabled: false });
	try {
		expect((await call(request, "publishPost", publish)).ok).toBe(false);
	} finally {
		await db.updateTable({ databaseId, tableId: "media", enabled: true });
	}
	const absent = await db.listRows({
		databaseId,
		tableId: "posts",
		queries: [Query.equal("$id", publish.requestId)],
	});
	expect(absent.total).toBe(0);
	const post = value(
		await call<{ id: string; slug: string }>(request, "publishPost", publish),
	);
	expect(
		value(await call<{ id: string }>(request, "publishPost", publish)).id,
	).toBe(post.id);
	expect(post.slug.endsWith(post.id)).toBe(true);
	const data = await db.getRow({
		databaseId,
		tableId: "posts",
		rowId: post.id,
	});
	expect(data.status).toBe("PUBLISHED");
	const media = await db.listRows({
		databaseId,
		tableId: "media",
		queries: [Query.equal("postId", post.id)],
	});
	expect(media.total).toBe(2);
	const read = value(
		await call<{ url: string; expiresAt: number }>(
			request,
			"readPostMedia",
			{ postId: post.id, kind: "video" },
			-1,
			true,
		),
	);
	expect(
		new URL(read.url).searchParams.get("versionId")?.length,
	).toBeGreaterThan(1);
	const range = await request.get(read.url, {
		headers: { Range: "bytes=0-1023" },
	});
	expect(range.status()).toBe(206);
	expect((await range.body()).length).toBe(1024);
	const whole = await request.get(read.url);
	expect(sha(new Uint8Array(await whole.body()))).toBe(sha(video));
	const assetRow = await db.getRow({
		databaseId,
		tableId: "media_assets",
		rowId: ready.id,
	});
	const { s3 } = storage();
	try {
		await s3.send(
			new PutObjectCommand({
				Bucket: assetRow.bucket,
				Key: assetRow.objectKey,
				Body: new Uint8Array([9, 8, 7]),
				ContentType: "video/mp4",
			}),
		);
	} finally {
		s3.destroy();
	}
	const pinned = value(
		await call<{ url: string }>(
			request,
			"readPostMedia",
			{ postId: post.id, kind: "video" },
			-1,
			true,
		),
	);
	expect(
		sha(new Uint8Array(await (await request.get(pinned.url)).body())),
	).toBe(sha(video));
	await page.waitForTimeout(5000);
	expect((await request.get(pinned.url)).ok()).toBe(false);
	const renewed = value(
		await call<{ url: string }>(
			request,
			"readPostMedia",
			{ postId: post.id, kind: "video" },
			-1,
			true,
		),
	);
	expect(
		(
			await request.get(renewed.url, { headers: { Range: "bytes=1024-2047" } })
		).status(),
	).toBe(206);
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: post.id,
		data: { status: "ARCHIVED" },
		permissions: [],
	});
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
	expect((await request.get(renewed.url)).ok()).toBe(true); // Deliberate residual capability until expiry.
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: post.id,
		data: { status: "PUBLISHED" },
		permissions: ['read("any")'],
	});
	const direct = new URL(read.url);
	direct.search = "";
	expect((await request.get(direct.toString())).ok()).toBe(false);
	await Bun.write(
		`${state}/published.json`,
		JSON.stringify({ post, assetId: ready.id, thumbnailId: thumbnail.id }),
	);
});
test("rejected bytes and cancelled allocation cannot publish; avatar persists with current public visibility", async ({
	request,
	page,
}) => {
	await page.goto("/en/about");
	const invalid = new Uint8Array([1, 2, 3, 4]);
	const asset = await allocate(request, invalid, "avatar");
	const signed = value(
		await call<{ url: string }>(request, "signAssetPart", {
			assetId: asset.id,
			partNumber: 1,
		}),
	);
	expect((await uploadPart(page, signed.url, invalid)).status).toBe(200);
	expect((await call(request, "finalizeAsset", { assetId: asset.id })).ok).toBe(
		false,
	);
	expect((await call(request, "replaceAvatar", { assetId: asset.id })).ok).toBe(
		false,
	);
	expect(
		value(
			await call<{ cancelled: boolean }>(request, "cancelAsset", {
				assetId: asset.id,
			}),
		).cancelled,
	).toBe(true);
	expect((await call(request, "resumeAsset", { assetId: asset.id })).ok).toBe(
		true,
	); // Terminal state is observable, never an upload capability.
	expect(
		(await call(request, "signAssetPart", { assetId: asset.id, partNumber: 1 }))
			.ok,
	).toBe(false);
	const image = new Uint8Array(
		await Bun.file(`${state}/thumbnail.webp`).arrayBuffer(),
	);
	const avatar = await upload(request, page, image, "avatar");
	expect(
		(await call(request, "replaceAvatar", { assetId: avatar.id }, 1)).ok,
	).toBe(false);
	const result = value(
		await call<{ image: string }>(request, "replaceAvatar", {
			assetId: avatar.id,
		}),
	);
	expect(result.image).toBe(`/media/${avatar.id}`);
	expect((await request.get(result.image, { maxRedirects: 0 })).status()).toBe(
		307,
	);
	await page.goto("/en/user/media-actor-0");
	await page.reload();
	const profile = await db.getRow({
		databaseId,
		tableId: "profiles",
		rowId: "media-actor-0",
	});
	expect(profile.image).toBe(result.image);
	const replacement = await upload(request, page, image, "avatar");
	value(await call(request, "replaceAvatar", { assetId: replacement.id }));
	expect(
		(await call(request, "readAsset", { assetId: avatar.id }, -1, true)).ok,
	).toBe(false);
	expect(
		(await request.get(`/media/${avatar.id}`, { maxRedirects: 0 })).status(),
	).toBe(404);
	const journal = `${state}/recovery-${crypto.randomUUID()}.json`;
	for (const execute of [false, true, true]) {
		const command = Bun.spawn(
			[
				"bun",
				"scripts/media-recover.ts",
				"--asset",
				asset.id,
				...(execute
					? ["--execute", "--journal", `${journal}-${crypto.randomUUID()}`]
					: []),
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const [out, err, code] = await Promise.all([
			new Response(command.stdout).text(),
			new Response(command.stderr).text(),
			command.exited,
		]);
		expect(code).toBe(0);
		expect(err.length).toBe(0);
		expect(JSON.parse(out).eligible).toBe(true);
	}
});
