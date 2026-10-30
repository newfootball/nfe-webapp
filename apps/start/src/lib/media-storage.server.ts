import "@tanstack/react-start/server-only";
import { chmod, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { inspectContent } from "./media-policy";

const ConfigSchema = z.object({
	B2_APPLICATION_KEY_ID: z.string().min(1),
	B2_APPLICATION_KEY: z.string().min(1),
	B2_BUCKET_NAME: z.string().min(1),
	B2_REGION: z.string().min(1),
	B2_ENDPOINT: z
		.url()
		.refine((v) => /^https:\/\/s3\.[a-z0-9-]+\.backblazeb2\.com\/?$/.test(v)),
	START_MEDIA_PREFIX: z.string().regex(/^[a-zA-Z0-9/_-]{1,200}\/$/),
	START_MEDIA_MAX_VIDEO_BYTES: z.coerce
		.number()
		.int()
		.min(1)
		.max(512 * 1024 ** 2)
		.default(100 * 1024 ** 2),
	START_MEDIA_MAX_IMAGE_BYTES: z.coerce
		.number()
		.int()
		.min(1)
		.max(10 * 1024 ** 2)
		.default(2 * 1024 ** 2),
	START_MEDIA_READ_TTL_SECONDS: z.coerce
		.number()
		.int()
		.min(2)
		.max(120)
		.default(120),
	START_MEDIA_MAX_DURATION: z.coerce
		.number()
		.int()
		.min(1)
		.max(600)
		.default(180),
	START_MEDIA_PROCESS_TIMEOUT_MS: z.coerce
		.number()
		.int()
		.min(1000)
		.max(120000)
		.default(60000),
});
export function storageConfig() {
	const c = ConfigSchema.parse(process.env);
	if (new URL(c.B2_ENDPOINT).hostname !== `s3.${c.B2_REGION}.backblazeb2.com`)
		throw new Error("Invalid endpoint");
	return c;
}
export function storage() {
	const c = storageConfig();
	return {
		config: c,
		s3: new S3Client({
			endpoint: c.B2_ENDPOINT,
			region: c.B2_REGION,
			forcePathStyle: true,
			maxAttempts: 2,
			requestHandler: { requestTimeout: 20000, connectionTimeout: 5000 },
			credentials: {
				accessKeyId: c.B2_APPLICATION_KEY_ID,
				secretAccessKey: c.B2_APPLICATION_KEY,
			},
			requestChecksumCalculation: "WHEN_REQUIRED",
			responseChecksumValidation: "WHEN_REQUIRED",
		}),
	};
}
export type StoredAsset = {
	bucket: string;
	objectKey: string;
	versionId: string;
	byteSize: number;
	sha256: string;
	kind: string;
	mimetype: string;
};
export class MediaContentError extends Error {}
async function run(args: string[], timeout: number) {
	const p = Bun.spawn(args, {
		stdout: "pipe",
		stderr: "ignore",
		env: { PATH: process.env.PATH },
		timeout,
	});
	const output = await new Response(p.stdout).text();
	if ((await p.exited) || output.length > 32768)
		throw new MediaContentError("Content processing failed");
	return output;
}
let active = 0;
export async function validateVersion(asset: StoredAsset) {
	if (active >= 2) throw new Error("Processing busy");
	const { s3, config } = storage();
	active++;
	let dir: string | undefined;
	try {
		if (
			asset.bucket !== config.B2_BUCKET_NAME ||
			!asset.objectKey.startsWith(config.START_MEDIA_PREFIX) ||
			!asset.versionId
		)
			throw new Error("Foreign asset");
		dir = await mkdtemp(join(tmpdir(), "nfe-media-"));
		await chmod(dir, 0o700);
		const path = join(dir, "input"),
			file = await open(path, "wx", 0o600);
		const hash = new Bun.CryptoHasher("sha256");
		let size = 0;
		try {
			const object = await s3.send(
				new GetObjectCommand({
					Bucket: asset.bucket,
					Key: asset.objectKey,
					VersionId: asset.versionId,
				}),
				{
					abortSignal: AbortSignal.timeout(
						config.START_MEDIA_PROCESS_TIMEOUT_MS,
					),
				},
			);
			if (
				object.ContentLength !== asset.byteSize ||
				object.ContentType !== asset.mimetype ||
				object.VersionId !== asset.versionId ||
				!object.Body
			)
				throw new MediaContentError("Object metadata mismatch");
			const reader = object.Body.transformToWebStream().getReader();
			while (true) {
				const { value: bytes, done } = await reader.read();
				if (done) break;
				size += bytes.byteLength;
				if (size > asset.byteSize)
					throw new MediaContentError("Object too large");
				hash.update(bytes);
				await file.writeFile(bytes);
			}
		} finally {
			await file.close();
		}
		if (size !== asset.byteSize || hash.digest("hex") !== asset.sha256)
			throw new MediaContentError("Object hash mismatch");
		const probe = await run(
			[
				"ffprobe",
				"-max_alloc",
				"67108864",
				"-f",
				asset.kind === "video" ? "mov" : "webp_pipe",
				"-v",
				"error",
				"-protocol_whitelist",
				"file",
				"-show_entries",
				"stream=codec_type,codec_name,pix_fmt,width,height:format=format_name,duration",
				"-of",
				"json",
				path,
			],
			config.START_MEDIA_PROCESS_TIMEOUT_MS,
		);
		let metadata: ReturnType<typeof inspectContent>;
		try {
			metadata = inspectContent(
				asset.kind,
				JSON.parse(probe),
				config.START_MEDIA_MAX_DURATION,
			);
		} catch {
			throw new MediaContentError("Unsupported content");
		}
		// Decode all bounded input; probe metadata alone does not establish valid content.
		await run(
			[
				"ffmpeg",
				"-max_alloc",
				"67108864",
				"-nostdin",
				"-v",
				"error",
				"-xerror",
				"-threads",
				"1",
				"-protocol_whitelist",
				"file",
				"-f",
				asset.kind === "video" ? "mov" : "webp_pipe",
				"-i",
				path,
				"-map",
				"0:v:0",
				"-map",
				"0:a?",
				"-f",
				"null",
				"-",
			],
			config.START_MEDIA_PROCESS_TIMEOUT_MS,
		);
		return metadata;
	} finally {
		if (dir) await rm(dir, { recursive: true, force: true });
		active--;
		s3.destroy();
	}
}
