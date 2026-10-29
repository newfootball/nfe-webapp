import "@tanstack/react-start/server-only";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	ListPartsCommand,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppwriteException, type Models, Query } from "node-appwrite";
import { AuthFailure } from "./auth-context.server";
import {
	type AllocateAsset,
	AllocateAssetSchema,
	type AssetRequest,
	type PartRequest,
} from "./media-contract";
import {
	assertOwner,
	assetTable,
	claim,
	databaseId,
	fencedPatch,
	maybeRow,
	mediaDB,
	mediaSelf,
	ownAsset,
	patch,
	privateACL,
	row,
	transaction,
	uploadDTO,
} from "./media-db.server";
import { expectedPartBytes, inspectParts } from "./media-policy";
import {
	MediaContentError,
	storage,
	storageConfig,
	validateVersion,
} from "./media-storage.server";

export function objectRef(a: Models.DefaultRow) {
	const config = storageConfig();
	if (
		a.provider !== "B2" ||
		a.bucket !== config.B2_BUCKET_NAME ||
		!a.objectKey.startsWith(config.START_MEDIA_PREFIX) ||
		!a.objectKey.endsWith(`/${a.$id}`)
	)
		throw new AuthFailure("forbidden");
	return { Bucket: String(a.bucket), Key: String(a.objectKey) };
}
async function parts(a: Models.DefaultRow) {
	const { s3 } = storage();
	try {
		const r = await s3.send(
			new ListPartsCommand({
				...objectRef(a),
				UploadId: a.uploadId,
				MaxParts: 104,
			}),
		);
		if (r.IsTruncated) throw new AuthFailure("invalid");
		return inspectParts(a.byteSize, r.Parts ?? []);
	} finally {
		s3.destroy();
	}
}
async function initialize(a: Models.DefaultRow, ownerId: string) {
	const { token } = await claim(a.$id, ownerId, "INITIALIZING", [
		"ALLOCATED",
		"INITIALIZING",
	]);
	const { s3 } = storage();
	try {
		// Recover an initiation whose response/DB write was lost, by this random key only.
		const previous = await s3.send(
			new ListMultipartUploadsCommand({
				Bucket: a.bucket,
				Prefix: a.objectKey,
				MaxUploads: 10,
			}),
		);
		if (previous.IsTruncated) throw new AuthFailure("invalid");
		const found = (previous.Uploads ?? []).filter((u) => u.Key === a.objectKey);
		if (found.length > 1) throw new AuthFailure("invalid");
		const uploadId =
			found[0]?.UploadId ??
			(
				await s3.send(
					new CreateMultipartUploadCommand({
						...objectRef(a),
						ContentType: a.mimetype,
						CacheControl: "private, no-store",
					}),
				)
			).UploadId;
		if (!uploadId) throw new AuthFailure("unavailable");
		return await fencedPatch(a.$id, ownerId, "INITIALIZING", token, {
			metadataJson: null,
			uploadId,
			state: "UPLOADING",
			leaseUntil: null,
		});
	} finally {
		s3.destroy();
	}
}
export async function allocate(input: AllocateAsset) {
	const v = AllocateAssetSchema.parse(input),
		{ ownerId } = await mediaSelf(),
		config = storageConfig();
	if (
		v.mimetype !== (v.kind === "video" ? "video/mp4" : "image/webp") ||
		v.byteSize >
			(v.kind === "video"
				? config.START_MEDIA_MAX_VIDEO_BYTES
				: config.START_MEDIA_MAX_IMAGE_BYTES)
	)
		throw new AuthFailure("invalid");
	const db = mediaDB(true);
	let a = await maybeRow(db, assetTable, v.requestId);
	if (!a) {
		const active = await db.listRows({
			databaseId: databaseId(),
			tableId: assetTable,
			queries: [
				Query.equal("ownerId", ownerId),
				Query.equal("state", [
					"ALLOCATED",
					"INITIALIZING",
					"UPLOADING",
					"FINALIZING",
					"READY",
				]),
				Query.limit(20),
			],
			total: false,
		});
		if (active.rows.length >= 20) throw new AuthFailure("forbidden");
		const now = new Date().toISOString();
		try {
			a = await db.createRow<Models.DefaultRow>({
				databaseId: databaseId(),
				tableId: assetTable,
				rowId: v.requestId,
				permissions: privateACL(ownerId),
				data: {
					ownerId,
					kind: v.kind,
					state: "ALLOCATED",
					provider: "B2",
					bucket: config.B2_BUCKET_NAME,
					objectKey: `${config.START_MEDIA_PREFIX}${crypto.randomUUID()}/${v.requestId}`,
					byteSize: v.byteSize,
					sha256: v.sha256,
					mimetype: v.mimetype,
					createdAt: now,
					updatedAt: now,
				},
			});
		} catch (e) {
			if (!(e instanceof AppwriteException && e.code === 409)) throw e;
			a = await row(db, assetTable, v.requestId);
		}
	}
	if (!a) throw new AuthFailure("unavailable");
	assertOwner(a, ownerId);
	if (
		a.sha256 !== v.sha256 ||
		a.byteSize !== v.byteSize ||
		a.kind !== v.kind ||
		a.mimetype !== v.mimetype
	)
		throw new AuthFailure("invalid");
	if (["ALLOCATED", "INITIALIZING"].includes(a.state))
		a = await initialize(a, ownerId);
	return uploadDTO(a, a.state === "UPLOADING" ? await parts(a) : []);
}
export async function resume(input: AssetRequest) {
	const { ownerId } = await mediaSelf();
	let a = await ownAsset(input.assetId, ownerId);
	if (["ALLOCATED", "INITIALIZING"].includes(a.state))
		a = await initialize(a, ownerId);
	return uploadDTO(a, a.state === "UPLOADING" ? await parts(a) : []);
}
export async function signPart(input: PartRequest) {
	const { ownerId } = await mediaSelf(),
		a = await ownAsset(input.assetId, ownerId);
	if (a.state !== "UPLOADING" || !a.uploadId)
		throw new AuthFailure("forbidden");
	expectedPartBytes(a.byteSize, input.partNumber);
	const { s3 } = storage();
	try {
		return {
			url: await getSignedUrl(
				s3,
				new UploadPartCommand({
					...objectRef(a),
					UploadId: a.uploadId,
					PartNumber: input.partNumber,
					ContentLength: expectedPartBytes(a.byteSize, input.partNumber),
				}),
				{ expiresIn: 120, signableHeaders: new Set(["content-length"]) },
			),
		};
	} finally {
		s3.destroy();
	}
}
export async function finalize(input: AssetRequest) {
	const { ownerId } = await mediaSelf();
	let a = await ownAsset(input.assetId, ownerId);
	if (["READY", "ATTACHED"].includes(a.state)) return uploadDTO(a);
	const claimed = await claim(a.$id, ownerId, "FINALIZING", [
		"UPLOADING",
		"FINALIZING",
	]);
	a = claimed.asset;
	const { token } = claimed;
	const { s3 } = storage();
	let versionId: string | undefined = a.versionId ?? undefined;
	try {
		if (!versionId) {
			const versions = await s3.send(
				new ListObjectVersionsCommand({
					...{ Bucket: a.bucket, Prefix: a.objectKey },
					MaxKeys: 10,
				}),
			);
			const existing = (versions.Versions ?? []).filter(
				(v) => v.Key === a.objectKey,
			);
			if (versions.IsTruncated || existing.length > 1)
				throw new AuthFailure("invalid");
			versionId = existing[0]?.VersionId;
			if (!versionId) {
				const uploaded = inspectParts(
					a.byteSize,
					(await parts(a)).map((p) => ({
						PartNumber: p.number,
						Size: p.bytes,
						ETag: p.etag,
					})),
					true,
				);
				const completed = await s3.send(
					new CompleteMultipartUploadCommand({
						...objectRef(a),
						UploadId: a.uploadId,
						MultipartUpload: {
							Parts: uploaded.map((p) => ({
								PartNumber: p.number,
								ETag: p.etag,
							})),
						},
					}),
				);
				versionId = completed.VersionId;
			}
			if (!versionId) throw new AuthFailure("invalid");
			a = await fencedPatch(a.$id, ownerId, "FINALIZING", token, { versionId });
		}
		const head = await s3.send(
			new HeadObjectCommand({ ...objectRef(a), VersionId: versionId }),
		);
		if (
			head.VersionId !== versionId ||
			head.ContentLength !== a.byteSize ||
			head.ContentType !== a.mimetype
		)
			throw new AuthFailure("invalid");
		const metadata = await validateVersion({
			bucket: a.bucket,
			objectKey: a.objectKey,
			versionId,
			byteSize: a.byteSize,
			sha256: a.sha256,
			kind: a.kind,
			mimetype: a.mimetype,
		});
		return uploadDTO(
			await fencedPatch(a.$id, ownerId, "FINALIZING", token, {
				state: "READY",
				metadataJson: JSON.stringify(metadata),
				leaseUntil: null,
			}),
		);
	} catch (e) {
		// Persist exact version even on rejected content. A transient failure is replayable.
		try {
			await fencedPatch(a.$id, ownerId, "FINALIZING", token, {
				leaseUntil: null,
				...((e instanceof AuthFailure && e.reason === "invalid") ||
				e instanceof MediaContentError
					? { state: "REJECTED" }
					: {}),
			});
		} catch {} // A superseding claim/recovery owns the row; stale workers cannot clear its lease.
		throw e;
	} finally {
		s3.destroy();
	}
}
export async function cancel(input: AssetRequest) {
	const { ownerId } = await mediaSelf();
	const a = await transaction(async (db, tx) => {
		const current = await row(db, assetTable, input.assetId, tx);
		assertOwner(current, ownerId);
		if (
			!["ALLOCATED", "UPLOADING", "READY", "REJECTED", "CANCELLED"].includes(
				current.state,
			)
		)
			throw new AuthFailure("forbidden");
		await patch(
			db,
			current.$id,
			{ state: "CANCELLED", leaseUntil: null, metadataJson: null },
			tx,
		);
		return current;
	});
	if (a.uploadId && !a.versionId) {
		const { s3 } = storage();
		try {
			await s3.send(
				new AbortMultipartUploadCommand({
					...objectRef(a),
					UploadId: a.uploadId,
				}),
			);
		} catch (e) {
			if ((e as { name: string }).name !== "NoSuchUpload") throw e;
		} finally {
			s3.destroy();
		}
	}
	// Completed versions are retained for explicit replayable orphan recovery.
	return { cancelled: true as const };
}
