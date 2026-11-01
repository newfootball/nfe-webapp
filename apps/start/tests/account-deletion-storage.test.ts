import { beforeEach, expect, mock, test } from "bun:test";
import type { Models, TablesDB } from "node-appwrite";

const id = "12345678-1234-4234-8234-123456789abc";
const ownerId = "owner";
const asset = {
	$id: id,
	$sequence: "1",
	$tableId: "media_assets",
	$databaseId: "synthetic",
	$createdAt: "2026-01-01T00:00:00.000Z",
	$updatedAt: "2026-01-01T00:00:00.000Z",
	$permissions: [],
	ownerId,
	provider: "B2",
	bucket: "bucket",
	objectKey: `prefix/random/${id}`,
	state: "ATTACHED",
} as unknown as Models.DefaultRow;
let versions: { Key: string; VersionId: string }[];
let markers: { Key: string; VersionId: string }[];
let uploads: { Key: string; UploadId: string }[];
let foreign = false;
let truncated = false;
let calls: string[];
const key = asset.objectKey as string;
mock.module("@tanstack/react-start/server-only", () => ({}));
mock.module("../src/lib/post-lifecycle-storage.server", () => ({
	assertSyntheticPurge: () => ({
		B2_BUCKET_NAME: "bucket",
		START_MEDIA_PREFIX: "prefix/",
	}),
}));
mock.module("../src/lib/media-upload.server", () => ({
	objectRef: (a: Models.DefaultRow) => {
		if (
			a.provider !== "B2" ||
			a.bucket !== "bucket" ||
			!a.objectKey.startsWith("prefix/") ||
			!a.objectKey.endsWith(`/${a.$id}`)
		)
			throw new Error("foreign");
		return { Bucket: a.bucket, Key: a.objectKey };
	},
}));
mock.module("../src/lib/media-storage.server", () => ({
	storage: () => ({
		s3: {
			destroy() {},
			async send(command: {
				constructor: { name: string };
				input: { VersionId?: string; UploadId?: string };
			}) {
				const name = command.constructor.name;
				calls.push(name);
				if (name === "ListObjectVersionsCommand")
					return {
						Versions: versions,
						DeleteMarkers: markers,
						IsTruncated: truncated,
					};
				if (name === "ListMultipartUploadsCommand")
					return { Uploads: uploads, IsTruncated: truncated };
				if (name === "AbortMultipartUploadCommand") {
					uploads = uploads.filter(
						(v) => v.UploadId !== command.input.UploadId,
					);
					return {};
				}
				if (name === "DeleteObjectCommand") {
					versions = versions.filter(
						(v) => v.VersionId !== command.input.VersionId,
					);
					markers = markers.filter(
						(v) => v.VersionId !== command.input.VersionId,
					);
					return {};
				}
				throw new Error("unexpected command");
			},
		},
	}),
}));
process.env.START_APPWRITE_DATABASE = "synthetic";
const { inventoryAccountAsset, purgeAccountAsset } = await import(
	"../src/lib/account-deletion-storage.server"
);
const db = {
	async listRows({ tableId }: { tableId: string }) {
		if (tableId === "media_assets")
			return {
				rows: foreign ? [asset, { ...asset, $id: "foreign" }] : [asset],
			};
		if (tableId === "profiles") return { rows: [] };
		return { rows: [] };
	},
} as unknown as TablesDB;
beforeEach(() => {
	versions = [
		{ Key: key, VersionId: "v1" },
		{ Key: `${key}-other`, VersionId: "other" },
	];
	markers = [{ Key: key, VersionId: "m1" }];
	uploads = [{ Key: key, UploadId: "u1" }];
	foreign = false;
	truncated = false;
	calls = [];
});

test("inventories exact versions, markers and uploads and safely retries completed effects", async () => {
	const inventory = await inventoryAccountAsset(db, asset, ownerId);
	expect(inventory.versions).toEqual([
		{ id: "v1", marker: false },
		{ id: "m1", marker: true },
	]);
	expect(inventory.uploads).toEqual(["u1"]);
	await purgeAccountAsset(db, inventory, async () => {});
	await purgeAccountAsset(db, inventory, async () => {});
	expect(versions).toEqual([{ Key: `${key}-other`, VersionId: "other" }]);
	expect(markers).toEqual([]);
	expect(uploads).toEqual([]);
});

test("refuses foreign references, changed inventory, truncated listing and wrong owner", async () => {
	const inventory = await inventoryAccountAsset(db, asset, ownerId);
	foreign = true;
	await expect(
		purgeAccountAsset(db, inventory, async () => {}),
	).rejects.toThrow();
	expect(calls).not.toContain("DeleteObjectCommand");
	foreign = false;
	versions.push({ Key: key, VersionId: "new" });
	await expect(
		purgeAccountAsset(db, inventory, async () => {}),
	).rejects.toThrow();
	truncated = true;
	await expect(inventoryAccountAsset(db, asset, ownerId)).rejects.toThrow();
	await expect(inventoryAccountAsset(db, asset, "other")).rejects.toThrow();
});

test("accepts an Appwrite-safe legacy asset ID", async () => {
	const legacy = {
		...asset,
		$id: "cllegacy1234567890abcdef",
		objectKey: "prefix/random/cllegacy1234567890abcdef",
	};
	const legacyDb = {
		async listRows({ tableId }: { tableId: string }) {
			return { rows: tableId === "media_assets" ? [legacy] : [] };
		},
	} as unknown as TablesDB;
	const inventory = await inventoryAccountAsset(legacyDb, legacy, ownerId);
	expect(inventory.id).toBe(legacy.$id);
});
