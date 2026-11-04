import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import type { PreparedAsset } from "./download";
import type { MediaPlan } from "./media-plan";
import { assertStorageOwned, uploadMedia } from "./upload";

type Stored = {
	key: string;
	version: string;
	body: Buffer;
	type: string;
	metadata: Record<string, string>;
};
class FakeS3 {
	objects: Stored[] = [];
	deletes: string[] = [];
	private next = 0;
	async send(command: { constructor: { name: string }; input: never }) {
		const input = command.input as Record<
			string,
			string | Buffer | Record<string, string>
		>;
		const key = input.Key as string;
		switch (command.constructor.name) {
			case "GetBucketAclCommand":
				return {
					Owner: { ID: "me" },
					Grants: [
						{
							Permission: "FULL_CONTROL",
							Grantee: { Type: "CanonicalUser", ID: "me" },
						},
					],
				};
			case "ListObjectVersionsCommand": {
				const prefix = input.Prefix as string;
				return {
					IsTruncated: false,
					DeleteMarkers: [],
					Versions: this.objects
						.filter((o) => o.key.startsWith(prefix))
						.map((o) => ({ Key: o.key, VersionId: o.version })),
				};
			}
			case "ListMultipartUploadsCommand":
				return { IsTruncated: false, Uploads: [] };
			case "HeadObjectCommand": {
				const found = this.objects.find(
					(o) =>
						o.key === key &&
						(!input.VersionId || o.version === input.VersionId),
				);
				if (!found) throw { $metadata: { httpStatusCode: 404 } };
				return {
					VersionId: found.version,
					ContentLength: found.body.byteLength,
					ContentType: found.type,
					Metadata: found.metadata,
				};
			}
			case "GetObjectCommand": {
				const found = this.objects.find(
					(o) => o.key === key && o.version === input.VersionId,
				);
				if (!found) throw new Error("missing");
				return {
					Body: (async function* () {
						yield new Uint8Array(found.body);
					})(),
				};
			}
			case "PutObjectCommand": {
				const version = `v${++this.next}`;
				this.objects.push({
					key,
					version,
					body: Buffer.from(input.Body as Buffer),
					type: input.ContentType as string,
					metadata: input.Metadata as Record<string, string>,
				});
				return { VersionId: version };
			}
			case "DeleteObjectCommand":
				this.deletes.push(`${key}@${input.VersionId}`);
				this.objects = this.objects.filter(
					(o) => !(o.key === key && o.version === input.VersionId),
				);
				return {};
			default:
				throw new Error(`unexpected ${command.constructor.name}`);
		}
	}
}
const prefix = "nfe-import-63/0a4a62b0-9c2c-4f9e-8f8c-4b9b0b6b7f1a/";
const plan = (ids: string[]): MediaPlan => ({
	bucket: "nfe-webapp-dev",
	prefix,
	assets: ids.map((id) => ({ id })) as MediaPlan["assets"],
});
async function prepared(
	dir: string,
	files: Record<string, string>,
): Promise<PreparedAsset[]> {
	const out: PreparedAsset[] = [];
	for (const [assetId, content] of Object.entries(files)) {
		const path = join(dir, assetId);
		await writeFile(path, content, { mode: 0o600 });
		out.push({
			assetId,
			path,
			byteSize: Buffer.byteLength(content),
			sha256: createHash("sha256").update(content).digest("hex"),
			mimetype: "image/webp",
		});
	}
	return out;
}
test("frozen rebuild removes retired objects, replaces changed bytes and keeps the rest", async () => {
	const dir = await mkdtemp(join(tmpdir(), "business-upload-"));
	const client = new FakeS3() as unknown as S3Client;
	const s3 = client as unknown as FakeS3;
	const checkpointPath = join(dir, "upload-checkpoint.json");
	try {
		const first = {
			plan: plan(["keep", "change", "gone"]),
			prepared: await prepared(dir, { keep: "k", change: "c1", gone: "g" }),
			client,
			checkpointPath,
		};
		const uploaded = await uploadMedia(first);
		expect(uploaded.map((u) => u.assetId)).toEqual(["keep", "change", "gone"]);
		const next = {
			plan: plan(["keep", "change", "new"]),
			prepared: await prepared(dir, { keep: "k", change: "c2", new: "n" }),
			client,
			checkpointPath,
		};
		await expect(assertStorageOwned(next)).rejects.toThrow(
			"upload_binding_changed",
		);
		await expect(uploadMedia(next)).rejects.toThrow("upload_binding_changed");
		await assertStorageOwned({ ...next, rebuild: true });
		const rebuilt = await uploadMedia({ ...next, rebuild: true });
		expect(rebuilt.removed).toBe(2);
		expect(s3.deletes).toEqual([
			`${prefix}business-import/change@v2`,
			`${prefix}business-import/gone@v3`,
		]);
		expect(rebuilt.find((u) => u.assetId === "keep")?.versionId).toBe(
			uploaded.find((u) => u.assetId === "keep")?.versionId,
		);
		expect(rebuilt.find((u) => u.assetId === "change")?.versionId).toBe("v4");
		expect(s3.objects.map((o) => o.key.slice(prefix.length))).toEqual([
			"business-import/keep",
			"business-import/change",
			"business-import/new",
		]);
		const replay = await uploadMedia({ ...next, rebuild: true });
		expect([...replay]).toEqual([...rebuilt]);
		expect(replay.removed).toBe(0);
		await assertStorageOwned(next);
		expect([...(await uploadMedia(next))]).toEqual([...rebuilt]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
test("rebuild never deletes an object whose bytes or ownership token diverged", async () => {
	const dir = await mkdtemp(join(tmpdir(), "business-upload-"));
	const client = new FakeS3() as unknown as S3Client;
	const s3 = client as unknown as FakeS3;
	const checkpointPath = join(dir, "upload-checkpoint.json");
	try {
		await uploadMedia({
			plan: plan(["gone"]),
			prepared: await prepared(dir, { gone: "g" }),
			client,
			checkpointPath,
		});
		s3.objects[0]!.metadata = { ...s3.objects[0]!.metadata, nfeimport: "x" };
		await expect(
			uploadMedia({
				plan: plan([]),
				prepared: [],
				client,
				checkpointPath,
				rebuild: true,
			}),
		).rejects.toThrow("uploaded_object_ownership_or_metadata_changed");
		expect(s3.deletes).toEqual([]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
