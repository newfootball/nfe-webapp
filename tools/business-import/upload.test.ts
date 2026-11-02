import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import type { MediaPlan } from "./media-plan";
import {
	assertStorageOwned,
	cleanupUploadedMedia,
	uploadMedia,
} from "./upload";

type Stored = {
	key: string;
	version: string;
	bytes: Buffer;
	type: string;
	metadata: Record<string, string>;
};
class Store {
	objects: Stored[] = [];
	uploads = new Map<
		string,
		{
			key: string;
			parts: Map<number, Buffer>;
			type: string;
			metadata: Record<string, string>;
		}
	>();
	lostPutReceipt = false;
	async send(command: {
		constructor: { name: string };
		input: Record<string, unknown>;
	}): Promise<unknown> {
		const i = command.input,
			key = String(i.Key ?? "");
		const notFound = () => {
			throw { $metadata: { httpStatusCode: 404 } };
		};
		switch (command.constructor.name) {
			case "GetBucketAclCommand":
				return {
					Owner: { ID: "owner" },
					Grants: [
						{
							Permission: "FULL_CONTROL",
							Grantee: { Type: "CanonicalUser", ID: "owner" },
						},
					],
				};
			case "HeadObjectCommand": {
				const o = this.objects.findLast(
					(o) => o.key === key && (!i.VersionId || o.version === i.VersionId),
				);
				if (!o) return notFound();
				return {
					VersionId: o.version,
					ContentLength: o.bytes.length,
					ContentType: o.type,
					Metadata: o.metadata,
				};
			}
			case "GetObjectCommand": {
				const o = this.objects.find(
					(o) => o.key === key && o.version === i.VersionId,
				);
				if (!o) return notFound();
				return {
					Body: (async function* () {
						yield o.bytes;
					})(),
				};
			}
			case "ListObjectVersionsCommand":
				return {
					Versions: this.objects
						.filter((o) => o.key.startsWith(String(i.Prefix)))
						.map((o) => ({ Key: o.key, VersionId: o.version })),
				};
			case "ListMultipartUploadsCommand":
				return {
					Uploads: [...this.uploads]
						.filter(([, u]) => u.key.startsWith(String(i.Prefix)))
						.map(([id, u]) => ({ Key: u.key, UploadId: id })),
				};
			case "PutObjectCommand": {
				const version = crypto.randomUUID();
				this.objects.push({
					key,
					version,
					bytes: Buffer.from(i.Body as Uint8Array),
					type: String(i.ContentType),
					metadata: i.Metadata as Record<string, string>,
				});
				if (this.lostPutReceipt) {
					this.lostPutReceipt = false;
					throw new Error("transport_lost");
				}
				return { VersionId: version };
			}
			case "CreateMultipartUploadCommand": {
				const id = crypto.randomUUID();
				this.uploads.set(id, {
					key,
					parts: new Map(),
					type: String(i.ContentType),
					metadata: i.Metadata as Record<string, string>,
				});
				return { UploadId: id };
			}
			case "UploadPartCommand": {
				const u = this.uploads.get(String(i.UploadId));
				if (!u) throw new Error("unknown_upload");
				u.parts.set(Number(i.PartNumber), Buffer.from(i.Body as Uint8Array));
				return { ETag: `part-${i.PartNumber}` };
			}
			case "CompleteMultipartUploadCommand": {
				const u = this.uploads.get(String(i.UploadId));
				if (!u) throw new Error("unknown_upload");
				const version = crypto.randomUUID();
				this.objects.push({
					key,
					version,
					bytes: Buffer.concat(
						[...u.parts].sort(([a], [b]) => a - b).map(([, v]) => v),
					),
					type: u.type,
					metadata: u.metadata,
				});
				this.uploads.delete(String(i.UploadId));
				return { VersionId: version };
			}
			case "DeleteObjectCommand":
				this.objects = this.objects.filter(
					(o) => o.key !== key || o.version !== i.VersionId,
				);
				return {};
			case "AbortMultipartUploadCommand":
				this.uploads.delete(String(i.UploadId));
				return {};
			default:
				throw new Error("unexpected_command");
		}
	}
}
async function fixture(size: number) {
	const directory = await mkdtemp(join(tmpdir(), "nfe-upload-"));
	const bytes = Buffer.alloc(size, 42),
		path = join(directory, "media");
	await writeFile(path, bytes, { mode: 0o600 });
	const plan: MediaPlan = {
		bucket: "nfe-webapp-dev",
		prefix: `nfe-import-63/${crypto.randomUUID()}/`,
		assets: [
			{
				id: "asset",
				ownerId: "owner",
				postId: null,
				kind: "video",
				role: "delivery",
				mimetype: "video/mp4",
				fetchUrl: "https://example.test/fixture",
				provenance: {
					source: "media",
					id: "asset",
					type: "mainVideo",
					url: "https://example.test/fixture",
					mimetype: "video/mp4",
				},
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			},
		],
	};
	const store = new Store();
	return {
		directory,
		store,
		options: {
			plan,
			prepared: [
				{
					assetId: "asset",
					path,
					byteSize: size,
					sha256: createHash("sha256").update(bytes).digest("hex"),
					mimetype: "video/mp4",
				},
			],
			client: store as unknown as S3Client,
			checkpointPath: join(directory, "checkpoint.json"),
		},
	};
}
test("multipart resumes from durable part receipts, verifies bytes and removes exact versions", async () => {
	const f = await fixture(6 * 1024 * 1024);
	try {
		await expect(
			uploadMedia({
				...f.options,
				afterPart: async () => {
					throw new Error("crash");
				},
			}),
		).rejects.toThrow("crash");
		expect(f.store.uploads.size).toBe(1);
		const receipts = await uploadMedia(f.options);
		expect(receipts[0]?.sha256).toBe(f.options.prepared[0]?.sha256);
		expect(f.store.objects.length).toBe(1);
		await uploadMedia(f.options);
		expect(f.store.objects.length).toBe(1);
		await assertStorageOwned(f.options);
		await cleanupUploadedMedia(
			f.options.plan,
			f.options.client,
			f.options.checkpointPath,
		);
		expect(f.store.objects.length).toBe(0);
		expect(f.store.uploads.size).toBe(0);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});
test("cleanup recovers a committed upload whose receipt was lost", async () => {
	const f = await fixture(128);
	try {
		f.store.lostPutReceipt = true;
		await expect(uploadMedia(f.options)).rejects.toThrow("transport_lost");
		expect(f.store.objects.length).toBe(1);
		await cleanupUploadedMedia(
			f.options.plan,
			f.options.client,
			f.options.checkpointPath,
		);
		expect(f.store.objects.length).toBe(0);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});
test("foreign versions survive cleanup and prevent a false successful result", async () => {
	const f = await fixture(128);
	try {
		await uploadMedia(f.options);
		f.store.objects.push({
			key: `${f.options.plan.prefix}business-import/asset`,
			version: "foreign",
			bytes: Buffer.alloc(128),
			type: "video/mp4",
			metadata: {},
		});
		await expect(assertStorageOwned(f.options)).rejects.toThrow(
			"uploaded_object_ownership_or_metadata_changed",
		);
		await expect(
			cleanupUploadedMedia(
				f.options.plan,
				f.options.client,
				f.options.checkpointPath,
			),
		).rejects.toThrow("uploaded_object_ownership_or_metadata_changed");
		expect(f.store.objects.some((o) => o.version === "foreign")).toBe(true);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("unknown multipart is retained and explicitly blocks successful cleanup", async () => {
	const f = await fixture(128);
	try {
		await uploadMedia(f.options);
		f.store.uploads.set("unowned-upload", {
			key: `${f.options.plan.prefix}business-import/asset`,
			parts: new Map(),
			type: "video/mp4",
			metadata: {},
		});
		await expect(assertStorageOwned(f.options)).rejects.toThrow(
			"unknown_multipart_requires_recovery",
		);
		await expect(
			cleanupUploadedMedia(
				f.options.plan,
				f.options.client,
				f.options.checkpointPath,
			),
		).rejects.toThrow("unknown_multipart_requires_recovery");
		expect(f.store.uploads.has("unowned-upload")).toBe(true);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});
