// Explicit operational command. Dry-run by default; no timer or scheduler.
import { chmod, open } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
	AbortMultipartUploadCommand,
	DeleteObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { AssetIdSchema, mediaPath } from "../src/lib/media-contract";
import {
	assetTable,
	mediaDB,
	patch,
	row,
	transaction,
} from "../src/lib/media-db.server";
import { storage } from "../src/lib/media-storage.server";
import { objectRef } from "../src/lib/media-upload.server";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		asset: { type: "string", multiple: true },
		execute: { type: "boolean", default: false },
		journal: { type: "string" },
	},
	strict: true,
});
if (!values.asset?.length || values.asset.length > 100)
	throw new Error("Specify 1–100 --asset allocation UUIDs");
if (values.execute && !values.journal)
	throw new Error("Execution requires a new private --journal file");
const journal = values.journal ? await open(values.journal, "wx", 0o600) : null;
const { s3 } = storage();
try {
	for (const id of values.asset.map((v) => AssetIdSchema.parse(v))) {
		let asset = await row(mediaDB(), assetTable, id);
		const eligible = async (a: typeof asset, db = mediaDB(), tx?: string) => {
			if (a.leaseUntil && Date.parse(a.leaseUntil) > Date.now()) return false;
			if (
				a.state !== "CANCELLED" &&
				Date.parse(a.updatedAt) > Date.now() - 24 * 3600_000
			)
				return false;
			if (a.state === "ATTACHED") {
				if (a.kind !== "avatar") return false; // Published/historical posts never cleaned by this tool.
				const profile = await row(db, "profiles", a.ownerId, tx);
				if (profile.image === mediaPath(a.$id)) return false;
			}
			return true;
		};
		if (!(await eligible(asset))) {
			console.log(JSON.stringify({ assetId: id, eligible: false }));
			continue;
		}
		if (values.execute) {
			asset = await transaction(async (db, tx) => {
				const a = await row(db, assetTable, id, tx);
				if (!(await eligible(a, db, tx)))
					throw new Error("Asset became ineligible");
				await patch(
					db,
					id,
					{ state: "CANCELLED", leaseUntil: null, metadataJson: null },
					tx,
				);
				return a;
			});
		}
		const ref = objectRef(asset);
		const uploads = await s3.send(
			new ListMultipartUploadsCommand({
				Bucket: ref.Bucket,
				Prefix: ref.Key,
				MaxUploads: 100,
			}),
		);
		const versions = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: ref.Bucket,
				Prefix: ref.Key,
				MaxKeys: 100,
			}),
		);
		if (uploads.IsTruncated || versions.IsTruncated)
			throw new Error("Recovery bound exceeded");
		const ownUploads = (uploads.Uploads ?? []).filter(
			(u) => u.Key === ref.Key && u.UploadId,
		);
		const ownVersions = [
			...(versions.Versions ?? []),
			...(versions.DeleteMarkers ?? []),
		].filter((v) => v.Key === ref.Key && v.VersionId);
		if (journal) {
			await journal.writeFile(
				`${JSON.stringify({ assetId: id, ...ref, uploads: ownUploads.map((u) => u.UploadId), versions: ownVersions.map((v) => v.VersionId) })}\n`,
			);
			await journal.sync();
		}
		if (values.execute) {
			for (const u of ownUploads)
				await s3.send(
					new AbortMultipartUploadCommand({ ...ref, UploadId: u.UploadId }),
				);
			for (const v of ownVersions)
				await s3.send(
					new DeleteObjectCommand({ ...ref, VersionId: v.VersionId }),
				);
		}
		console.log(
			JSON.stringify({
				assetId: id,
				eligible: true,
				dryRun: !values.execute,
				uploads: ownUploads.length,
				versions: ownVersions.length,
			}),
		);
	}
} catch {
	console.error(
		"Media recovery failed; inspect protected journal and retry the same allocation IDs",
	);
	process.exitCode = 1;
} finally {
	await journal?.close();
	if (values.journal) await chmod(values.journal, 0o600);
	s3.destroy();
}
