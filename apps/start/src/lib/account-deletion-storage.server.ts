import "@tanstack/react-start/server-only";
import {
	AbortMultipartUploadCommand,
	DeleteObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { type Models, Query, type TablesDB } from "node-appwrite";
import { z } from "zod";
import { AuthFailure } from "./auth-context.server";
import { FeedIdSchema } from "./feed-input";
import { mediaPath } from "./media-contract";
import { assetTable, databaseId } from "./media-db.server";
import { storage } from "./media-storage.server";
import { objectRef } from "./media-upload.server";
import { assertSyntheticPurge } from "./post-lifecycle-storage.server";

const inventorySchema = z.strictObject({
	id: FeedIdSchema,
	ownerId: z.string().min(1).max(36),
	bucket: z.string().min(1).max(255),
	objectKey: z.string().min(1).max(1024),
	versions: z
		.array(
			z.strictObject({ id: z.string().min(1).max(1024), marker: z.boolean() }),
		)
		.max(100),
	uploads: z.array(z.string().min(1).max(1024)).max(100),
});
export type AccountAssetInventory = z.infer<typeof inventorySchema>;
type Lease = () => Promise<void>;
const forbidden = () => new AuthFailure("forbidden");

function validateInventory(value: AccountAssetInventory) {
	const inventory = inventorySchema.parse(value);
	const c = assertSyntheticPurge();
	if (
		inventory.bucket !== c.B2_BUCKET_NAME ||
		!inventory.objectKey.startsWith(c.START_MEDIA_PREFIX) ||
		!inventory.objectKey.endsWith(`/${inventory.id}`) ||
		new Set(inventory.versions.map((v) => v.id)).size !==
			inventory.versions.length ||
		new Set(inventory.uploads).size !== inventory.uploads.length
	)
		throw forbidden();
	return inventory;
}

async function references(db: TablesDB, i: AccountAssetInventory) {
	for (const tableId of ["media", assetTable]) {
		const found = await db.listRows({
			databaseId: databaseId(),
			tableId,
			queries: [
				Query.equal("bucket", i.bucket),
				Query.equal("objectKey", i.objectKey),
				Query.limit(2),
			],
			total: false,
		});
		if (tableId === assetTable) {
			if (
				found.rows.length !== 1 ||
				found.rows[0]?.$id !== i.id ||
				found.rows[0]?.ownerId !== i.ownerId ||
				found.rows[0]?.provider !== "B2"
			)
				throw forbidden();
		} else if (
			found.rows.some((r) => r.$id !== i.id || r.ownerId !== i.ownerId)
		)
			throw forbidden();
	}
	const profiles = await db.listRows({
		databaseId: databaseId(),
		tableId: "profiles",
		queries: [Query.equal("image", mediaPath(i.id)), Query.limit(2)],
		total: false,
	});
	if (profiles.rows.some((r) => r.$id !== i.ownerId)) throw forbidden();
}

async function list(i: Pick<AccountAssetInventory, "bucket" | "objectKey">) {
	const { s3 } = storage();
	try {
		const versions = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: i.bucket,
				Prefix: i.objectKey,
				MaxKeys: 100,
			}),
		);
		const uploads = await s3.send(
			new ListMultipartUploadsCommand({
				Bucket: i.bucket,
				Prefix: i.objectKey,
				MaxUploads: 100,
			}),
		);
		if (versions.IsTruncated || uploads.IsTruncated) throw forbidden();
		return {
			versions: [
				...(versions.Versions ?? [])
					.filter((v) => v.Key === i.objectKey)
					.map((v) => ({ id: v.VersionId, marker: false })),
				...(versions.DeleteMarkers ?? [])
					.filter((v) => v.Key === i.objectKey)
					.map((v) => ({ id: v.VersionId, marker: true })),
			],
			uploads: (uploads.Uploads ?? [])
				.filter((u) => u.Key === i.objectKey)
				.map((u) => u.UploadId),
		};
	} finally {
		s3.destroy();
	}
}

export async function inventoryAccountAsset(
	db: TablesDB,
	a: Models.DefaultRow,
	ownerId: string,
): Promise<AccountAssetInventory> {
	assertSyntheticPurge();
	if (a.ownerId !== ownerId) throw forbidden();
	const location = objectRef(a);
	const found = await list({
		bucket: location.Bucket,
		objectKey: location.Key,
	});
	const inventory = validateInventory(
		inventorySchema.parse({
			id: a.$id,
			ownerId,
			bucket: location.Bucket,
			objectKey: location.Key,
			...found,
		}),
	);
	await references(db, inventory);
	return inventory;
}

export async function purgeAccountAsset(
	db: TablesDB,
	value: AccountAssetInventory,
	assertLease: Lease,
): Promise<void> {
	const i = validateInventory(value);
	const check = async () => {
		await assertLease();
		await references(db, i);
		const current = await list(i);
		if (
			current.versions.some(
				(v) =>
					!i.versions.some(
						(known) => known.id === v.id && known.marker === v.marker,
					),
			) ||
			current.uploads.some((id) => !i.uploads.includes(id ?? ""))
		)
			throw forbidden();
		await assertLease();
	};
	const { s3 } = storage();
	try {
		for (const upload of i.uploads) {
			await check();
			try {
				await s3.send(
					new AbortMultipartUploadCommand({
						Bucket: i.bucket,
						Key: i.objectKey,
						UploadId: upload,
					}),
				);
			} catch (e) {
				if ((e as { name?: string }).name !== "NoSuchUpload") throw e;
			}
		}
		for (const version of i.versions) {
			await check();
			await s3.send(
				new DeleteObjectCommand({
					Bucket: i.bucket,
					Key: i.objectKey,
					VersionId: version.id,
				}),
			);
		}
		await check();
		const remaining = await list(i);
		if (remaining.versions.length || remaining.uploads.length)
			throw forbidden();
	} finally {
		s3.destroy();
	}
}
