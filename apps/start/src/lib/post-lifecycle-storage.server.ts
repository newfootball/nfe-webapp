import "@tanstack/react-start/server-only";
import {
	DeleteObjectCommand,
	HeadObjectCommand,
	ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import type { Models, TablesDB } from "node-appwrite";
import { Query } from "node-appwrite";
import { AuthFailure } from "./auth-context.server";
import { mediaPath } from "./media-contract";
import { assetTable, databaseId } from "./media-db.server";
import { storage, storageConfig } from "./media-storage.server";
import { objectRef } from "./media-upload.server";
import { type PurgeAsset, PurgeAssetSchema } from "./post-lifecycle-contract";

// Local synthetic permission is explicit and separate from normal upload/read configuration.
// A production retention policy and imported legacy reconciliation are deliberately absent.
export function assertSyntheticPurge() {
	const c = storageConfig();
	if (
		process.env.START_LIFECYCLE_SYNTHETIC_PROJECT !==
			process.env.START_APPWRITE_PROJECT ||
		!process.env.START_LIFECYCLE_SYNTHETIC_PROJECT ||
		process.env.START_LIFECYCLE_SYNTHETIC_PREFIX !== c.START_MEDIA_PREFIX ||
		!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(
			process.env.START_APPWRITE_ENDPOINT ?? "",
		)
	)
		throw new AuthFailure("forbidden");
	return c;
}
export async function inventoryAsset(
	a: Models.DefaultRow,
): Promise<PurgeAsset> {
	assertSyntheticPurge();
	if (
		a.provider !== "B2" ||
		a.state !== "ATTACHED" ||
		!a.versionId ||
		!a.sha256
	)
		throw new AuthFailure("forbidden");
	const location = objectRef(a),
		{ s3 } = storage();
	try {
		const found = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: location.Bucket,
				Prefix: location.Key,
				MaxKeys: 100,
			}),
		);
		// Bounded exact-key inventory only. A larger key stays retained for explicit recovery.
		if (found.IsTruncated) throw new AuthFailure("forbidden");
		const versions = [
			...(found.Versions ?? [])
				.filter((v) => v.Key === location.Key)
				.map((v) => ({ id: v.VersionId, marker: false })),
			...(found.DeleteMarkers ?? [])
				.filter((v) => v.Key === location.Key)
				.map((v) => ({ id: v.VersionId, marker: true })),
		];
		if (!versions.some((v) => v.id === a.versionId && !v.marker))
			throw new AuthFailure("forbidden");
		return PurgeAssetSchema.parse({
			id: a.$id,
			bucket: a.bucket,
			objectKey: a.objectKey,
			versionId: a.versionId,
			sha256: a.sha256,
			versions,
		});
	} finally {
		s3.destroy();
	}
}
export async function deleteExactVersion(
	db: TablesDB,
	asset: PurgeAsset,
	version: PurgeAsset["versions"][number],
) {
	const config = assertSyntheticPurge();
	if (
		asset.bucket !== config.B2_BUCKET_NAME ||
		!asset.objectKey.startsWith(config.START_MEDIA_PREFIX) ||
		!asset.objectKey.endsWith(`/${asset.id}`) ||
		!asset.versions.some(
			(v) => v.id === version.id && v.marker === version.marker,
		)
	)
		throw new AuthFailure("forbidden");
	// All references to the exact key are considered, even references to an older version.
	// The source allocation remains a tombstone, so its ID cannot be allocated again.
	for (const tableId of ["media", assetTable]) {
		const found = await db.listRows({
			databaseId: databaseId(),
			tableId,
			queries: [
				Query.equal("bucket", asset.bucket),
				Query.equal("objectKey", asset.objectKey),
				Query.limit(2),
			],
			total: false,
		});
		if (
			tableId === "media"
				? found.rows.length > 0
				: found.rows.some(
						(r) =>
							r.$id !== asset.id ||
							r.state !== "CANCELLED" ||
							r.postId ||
							r.versionId !== asset.versionId ||
							r.sha256 !== asset.sha256,
					)
		)
			throw new AuthFailure("forbidden");
		if (
			tableId === assetTable &&
			(found.rows.length !== 1 || found.rows[0]?.$id !== asset.id)
		)
			throw new AuthFailure("forbidden");
	}
	const profiles = await db.listRows({
		databaseId: databaseId(),
		tableId: "profiles",
		queries: [Query.equal("image", mediaPath(asset.id)), Query.limit(1)],
		total: false,
	});
	if (profiles.rows.length) throw new AuthFailure("forbidden");
	const { s3 } = storage();
	try {
		if (!version.marker) {
			try {
				const head = await s3.send(
					new HeadObjectCommand({
						Bucket: asset.bucket,
						Key: asset.objectKey,
						VersionId: version.id,
					}),
				);
				if (head.VersionId !== version.id) throw new AuthFailure("forbidden");
			} catch (e) {
				if (
					(e as { $metadata?: { httpStatusCode?: number } }).$metadata
						?.httpStatusCode !== 404
				)
					throw e;
			}
		}
		// VersionId is always supplied. Never issue an unversioned DeleteObject.
		await s3.send(
			new DeleteObjectCommand({
				Bucket: asset.bucket,
				Key: asset.objectKey,
				VersionId: version.id,
			}),
		);
	} finally {
		s3.destroy();
	}
}
