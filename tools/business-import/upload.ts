import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetBucketAclCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { atomicPrivate, withLock } from "../identity-import/checkpoint";
import { readPrivate } from "../identity-import/source";
import type { PreparedAsset } from "./download";
import type { MediaPlan, UploadedObject } from "./media-plan";

const PART = 5 * 1024 * 1024;
const uploadedSchema = z.strictObject({
	assetId: z.string(),
	bucket: z.string(),
	objectKey: z.string(),
	versionId: z.string(),
	byteSize: z.number().int().positive(),
	sha256: z.string(),
	mimetype: z.string(),
});
const entrySchema = z.strictObject({
	assetId: z.string(),
	objectKey: z.string(),
	byteSize: z.number().int().positive(),
	sha256: z.string(),
	mimetype: z.string(),
	uploadId: z.string().optional(),
	parts: z.array(
		z.strictObject({ PartNumber: z.number().int(), ETag: z.string() }),
	),
	receipt: uploadedSchema.optional(),
});
const checkpointSchema = z.strictObject({
	version: z.literal(1),
	binding: z.string(),
	token: z.string(),
	entries: z.record(z.string(), entrySchema),
});
type UploadCheckpoint = z.infer<typeof checkpointSchema>;
export const contentHash = (value: string) =>
	createHash("sha256").update(value).digest("hex");

export function importStorage(config: Record<string, string>) {
	if (
		config.B2_BUCKET_NAME !== "nfe-webapp-dev" ||
		config.B2_REGION !== "eu-central-003" ||
		config.B2_ENDPOINT !== "https://s3.eu-central-003.backblazeb2.com" ||
		!config.B2_APPLICATION_KEY_ID ||
		!config.B2_APPLICATION_KEY
	)
		throw new Error("isolated_storage_required");
	return new S3Client({
		region: config.B2_REGION,
		endpoint: config.B2_ENDPOINT,
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.B2_APPLICATION_KEY_ID,
			secretAccessKey: config.B2_APPLICATION_KEY,
		},
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
		requestHandler: { connectionTimeout: 10000, requestTimeout: 60000 },
		maxAttempts: 2,
	});
}
async function assertPrivateBucket(client: S3Client, bucket: string) {
	const acl = await client.send(new GetBucketAclCommand({ Bucket: bucket }));
	const grant = acl.Grants?.[0];
	if (
		!acl.Owner?.ID ||
		acl.Grants?.length !== 1 ||
		grant?.Permission !== "FULL_CONTROL" ||
		grant.Grantee?.Type !== "CanonicalUser" ||
		grant.Grantee.ID !== acl.Owner.ID ||
		grant.Grantee.URI
	)
		throw new Error("private_bucket_required");
}
async function head(
	client: S3Client,
	bucket: string,
	key: string,
	version?: string,
) {
	try {
		return await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: version }),
		);
	} catch (error) {
		if (
			(error as { $metadata?: { httpStatusCode?: number } }).$metadata
				?.httpStatusCode === 404
		)
			return null;
		throw error;
	}
}
async function verifyObject(
	client: S3Client,
	entry: z.infer<typeof entrySchema>,
	cp: UploadCheckpoint,
	bucket: string,
	version: string,
) {
	const found = await head(client, bucket, entry.objectKey, version);
	if (
		!found ||
		found.VersionId !== version ||
		found.ContentLength !== entry.byteSize ||
		found.ContentType !== entry.mimetype ||
		found.Metadata?.nfeimport !== cp.token ||
		found.Metadata?.sha256 !== entry.sha256 ||
		found.Metadata?.nfeasset !== entry.assetId
	)
		throw new Error("uploaded_object_ownership_or_metadata_changed");
	const value = await client.send(
		new GetObjectCommand({
			Bucket: bucket,
			Key: entry.objectKey,
			VersionId: version,
		}),
	);
	if (!value.Body) throw new Error("uploaded_body_missing");
	const hash = createHash("sha256");
	let size = 0;
	for await (const chunk of value.Body as AsyncIterable<Uint8Array>) {
		size += chunk.byteLength;
		if (size > entry.byteSize) throw new Error("uploaded_bytes_changed");
		hash.update(chunk);
	}
	if (size !== entry.byteSize || hash.digest("hex") !== entry.sha256)
		throw new Error("uploaded_bytes_changed");
}
function binding(plan: MediaPlan, prepared: PreparedAsset[]) {
	if (
		plan.bucket !== "nfe-webapp-dev" ||
		!/^nfe-import-63\/[a-f0-9-]{36}\/$/.test(plan.prefix)
	)
		throw new Error("isolated_upload_prefix_required");
	if (
		prepared.length !== plan.assets.length ||
		new Set(prepared.map((a) => a.assetId)).size !== prepared.length ||
		plan.assets.some((a) => !prepared.some((p) => p.assetId === a.id))
	)
		throw new Error("complete_prepared_media_required");
	return contentHash(
		JSON.stringify({
			plan,
			prepared: prepared.map(({ path: _path, ...a }) => a),
		}),
	);
}

// Read-only check across the whole declared storage destination. The caller
// invokes this before creating identities or writing any business rows.
export async function assertStorageOwned(options: {
	plan: MediaPlan;
	prepared: PreparedAsset[];
	client: S3Client;
	checkpointPath: string;
}) {
	const { plan, prepared, client, checkpointPath } = options;
	const expectedBinding = binding(plan, prepared);
	await assertPrivateBucket(client, plan.bucket);
	return withLock(checkpointPath, async () => {
		let cp: UploadCheckpoint | null = null;
		try {
			cp = checkpointSchema.parse(await readPrivate(checkpointPath));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		if (cp && cp.binding !== expectedBinding)
			throw new Error("upload_binding_changed");
		const keys = new Map(
			plan.assets.map((asset) => [
				`${plan.prefix}business-import/${asset.id}`,
				asset.id,
			]),
		);
		const [versions, uploads] = await Promise.all([
			client.send(
				new ListObjectVersionsCommand({
					Bucket: plan.bucket,
					Prefix: plan.prefix,
					MaxKeys: 1000,
				}),
			),
			client.send(
				new ListMultipartUploadsCommand({
					Bucket: plan.bucket,
					Prefix: plan.prefix,
					MaxUploads: 1000,
				}),
			),
		]);
		if (
			versions.IsTruncated ||
			uploads.IsTruncated ||
			versions.DeleteMarkers?.length
		)
			throw new Error("storage_preflight_requires_recovery");
		for (const version of versions.Versions ?? []) {
			const id = version.Key ? keys.get(version.Key) : undefined;
			const item = id && cp ? cp.entries[id] : undefined;
			if (!cp || !item || !version.VersionId)
				throw new Error("foreign_storage_collision");
			await verifyObject(client, item, cp, plan.bucket, version.VersionId);
		}
		for (const upload of uploads.Uploads ?? []) {
			const id = upload.Key ? keys.get(upload.Key) : undefined;
			const item = id && cp ? cp.entries[id] : undefined;
			if (!item?.uploadId || item.uploadId !== upload.UploadId)
				throw new Error("unknown_multipart_requires_recovery");
		}
		for (const item of Object.values(cp?.entries ?? {})) {
			if (!keys.has(item.objectKey)) throw new Error("upload_entry_changed");
			if (
				item.receipt &&
				!versions.Versions?.some(
					(v) =>
						v.Key === item.objectKey && v.VersionId === item.receipt?.versionId,
				)
			)
				throw new Error("owned_storage_missing");
		}
	});
}

export async function uploadMedia(options: {
	plan: MediaPlan;
	prepared: PreparedAsset[];
	client: S3Client;
	checkpointPath: string;
	afterPart?: () => Promise<void>;
}) {
	const { plan, prepared, client, checkpointPath } = options;
	const expectedBinding = binding(plan, prepared);
	await assertPrivateBucket(client, plan.bucket);
	return withLock(checkpointPath, async () => {
		let cp: UploadCheckpoint;
		try {
			cp = checkpointSchema.parse(await readPrivate(checkpointPath));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			cp = {
				version: 1,
				binding: expectedBinding,
				token: randomBytes(32).toString("hex"),
				entries: {},
			};
		}
		if (cp.binding !== expectedBinding)
			throw new Error("upload_binding_changed");
		const save = () => atomicPrivate(checkpointPath, cp);
		await save();
		const receipts: UploadedObject[] = [];
		for (const file of prepared) {
			const key = `${plan.prefix}business-import/${file.assetId}`;
			const handle = await open(
				file.path,
				constants.O_RDONLY | constants.O_NOFOLLOW,
			);
			try {
				const stat = await handle.stat();
				if (
					!stat.isFile() ||
					stat.uid !== process.getuid?.() ||
					stat.mode & 0o077 ||
					stat.size !== file.byteSize ||
					stat.size > 512 * 1024 ** 2
				)
					throw new Error("unsafe_prepared_media");
				const hash = createHash("sha256");
				for await (const chunk of handle.createReadStream({ autoClose: false }))
					hash.update(chunk);
				if (hash.digest("hex") !== file.sha256)
					throw new Error("prepared_media_changed");
				let item = cp.entries[file.assetId];
				const existing = await head(client, plan.bucket, key);
				if (!item) {
					const [versions, uploads] = await Promise.all([
						client.send(
							new ListObjectVersionsCommand({
								Bucket: plan.bucket,
								Prefix: key,
								MaxKeys: 100,
							}),
						),
						client.send(
							new ListMultipartUploadsCommand({
								Bucket: plan.bucket,
								Prefix: key,
								MaxUploads: 100,
							}),
						),
					]);
					if (
						existing ||
						versions.IsTruncated ||
						uploads.IsTruncated ||
						[
							...(versions.Versions ?? []),
							...(versions.DeleteMarkers ?? []),
						].some((v) => v.Key === key) ||
						uploads.Uploads?.some((u) => u.Key === key)
					)
						throw new Error("foreign_storage_collision");
					item = {
						assetId: file.assetId,
						objectKey: key,
						byteSize: file.byteSize,
						sha256: file.sha256,
						mimetype: file.mimetype,
						parts: [],
					};
					cp.entries[file.assetId] = item;
					await save();
				}
				if (
					item.objectKey !== key ||
					item.sha256 !== file.sha256 ||
					item.byteSize !== file.byteSize ||
					item.mimetype !== file.mimetype
				)
					throw new Error("upload_entry_changed");
				// A receipt lost after completion can be recovered only via the durable,
				// unguessable ownership token and independent exact-version byte readback.
				if (!item.receipt && existing) {
					if (!existing.VersionId) throw new Error("unversioned_upload");
					await verifyObject(client, item, cp, plan.bucket, existing.VersionId);
					item.receipt = {
						assetId: file.assetId,
						bucket: plan.bucket,
						objectKey: key,
						versionId: existing.VersionId,
						byteSize: file.byteSize,
						sha256: file.sha256,
						mimetype: file.mimetype,
					};
					await save();
				}
				if (!item.receipt) {
					const metadata = {
						nfeimport: cp.token,
						nfeasset: file.assetId,
						sha256: file.sha256,
					};
					let version: string | undefined;
					if (file.byteSize <= PART) {
						const bytes = Buffer.alloc(file.byteSize);
						const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
						if (bytesRead !== bytes.length)
							throw new Error("prepared_file_truncated");
						version = (
							await client.send(
								new PutObjectCommand({
									Bucket: plan.bucket,
									Key: key,
									Body: bytes,
									ContentType: file.mimetype,
									Metadata: metadata,
								}),
							)
						).VersionId;
					} else {
						if (!item.uploadId) {
							const pending = await client.send(
								new ListMultipartUploadsCommand({
									Bucket: plan.bucket,
									Prefix: key,
									MaxUploads: 100,
								}),
							);
							if (
								pending.IsTruncated ||
								pending.Uploads?.some((u) => u.Key === key)
							)
								throw new Error("uncertain_multipart_requires_recovery");
							item.uploadId = (
								await client.send(
									new CreateMultipartUploadCommand({
										Bucket: plan.bucket,
										Key: key,
										ContentType: file.mimetype,
										Metadata: metadata,
									}),
								)
							).UploadId;
							if (!item.uploadId) throw new Error("missing_upload_id");
							await save();
						}
						for (
							let number = 1;
							number <= Math.ceil(file.byteSize / PART);
							number++
						) {
							if (item.parts.some((p) => p.PartNumber === number)) continue;
							const offset = (number - 1) * PART,
								bytes = Buffer.alloc(Math.min(PART, file.byteSize - offset));
							const { bytesRead } = await handle.read(
								bytes,
								0,
								bytes.length,
								offset,
							);
							if (bytesRead !== bytes.length)
								throw new Error("prepared_file_truncated");
							const part = await client.send(
								new UploadPartCommand({
									Bucket: plan.bucket,
									Key: key,
									UploadId: item.uploadId,
									PartNumber: number,
									Body: bytes,
								}),
							);
							if (!part.ETag) throw new Error("missing_part_receipt");
							item.parts.push({ PartNumber: number, ETag: part.ETag });
							await save();
							await options.afterPart?.();
						}
						version = (
							await client.send(
								new CompleteMultipartUploadCommand({
									Bucket: plan.bucket,
									Key: key,
									UploadId: item.uploadId,
									MultipartUpload: {
										Parts: [...item.parts].sort(
											(a, b) => a.PartNumber - b.PartNumber,
										),
									},
								}),
							)
						).VersionId;
					}
					if (!version) throw new Error("missing_version_receipt");
					item.receipt = {
						assetId: file.assetId,
						bucket: plan.bucket,
						objectKey: key,
						versionId: version,
						byteSize: file.byteSize,
						sha256: file.sha256,
						mimetype: file.mimetype,
					};
					await save();
				}
				await verifyObject(
					client,
					item,
					cp,
					plan.bucket,
					item.receipt.versionId,
				);
				receipts.push(item.receipt);
			} finally {
				await handle.close();
			}
		}
		return receipts;
	});
}

export async function cleanupUploadedMedia(
	plan: MediaPlan,
	client: S3Client,
	checkpointPath: string,
) {
	if (
		plan.bucket !== "nfe-webapp-dev" ||
		!/^nfe-import-63\/[a-f0-9-]{36}\/$/.test(plan.prefix)
	)
		throw new Error("isolated_upload_prefix_required");
	return withLock(checkpointPath, async () => {
		const cp = checkpointSchema.parse(await readPrivate(checkpointPath));
		for (const asset of plan.assets) {
			const item = cp.entries[asset.id];
			if (!item) continue;
			if (item.objectKey !== `${plan.prefix}business-import/${asset.id}`)
				throw new Error("cleanup_key_changed");
			// Include completions whose response/checkpoint write was lost, and SDK
			// retries that created another owned version. Every version must prove
			// ownership and byte identity before its exact VersionId can be deleted.
			const versions = await client.send(
				new ListObjectVersionsCommand({
					Bucket: plan.bucket,
					Prefix: item.objectKey,
					MaxKeys: 100,
				}),
			);
			if (
				versions.IsTruncated ||
				versions.DeleteMarkers?.some((v) => v.Key === item.objectKey)
			)
				throw new Error("cleanup_inventory_requires_recovery");
			for (const version of versions.Versions ?? []) {
				if (version.Key !== item.objectKey) continue;
				if (!version.VersionId) throw new Error("cleanup_version_missing");
				await verifyObject(client, item, cp, plan.bucket, version.VersionId);
				await client.send(
					new DeleteObjectCommand({
						Bucket: plan.bucket,
						Key: item.objectKey,
						VersionId: version.VersionId,
					}),
				);
			}
			if (item.uploadId && !item.receipt) {
				try {
					await client.send(
						new AbortMultipartUploadCommand({
							Bucket: plan.bucket,
							Key: item.objectKey,
							UploadId: item.uploadId,
						}),
					);
				} catch (error) {
					if ((error as { name?: string }).name !== "NoSuchUpload") throw error;
				}
			}
			const pending = await client.send(
				new ListMultipartUploadsCommand({
					Bucket: plan.bucket,
					Prefix: item.objectKey,
					MaxUploads: 100,
				}),
			);
			if (
				pending.IsTruncated ||
				pending.Uploads?.some((u) => u.Key === item.objectKey)
			)
				throw new Error("unknown_multipart_requires_recovery");
		}
	});
}
