import assert from "node:assert/strict";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectVersionsCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { b64, bytes, hash } from "./core.mts";

const bucket = "nfe-webapp-dev";
const endpoint = "https://s3.eu-central-003.backblazeb2.com";
const region = "eu-central-003";
export type MediaVersion = {
	key: string;
	versionId: string;
	deleted: boolean;
	latest: boolean;
	modified: string;
	sha256?: string;
	content?: string;
};
export function mediaPrefix(prefix: string) {
	assert.match(prefix, /^nfe-backup-47\/(source|restore)-[a-f0-9]{8}\/$/);
	return prefix;
}
export async function mediaClient(path: string) {
	const allowed = new Set([
		"B2_APPLICATION_KEY_ID",
		"B2_APPLICATION_KEY",
		"B2_BUCKET_NAME",
		"B2_ENDPOINT",
		"B2_REGION",
	]);
	const config: Record<string, string> = {};
	for (const line of (await Bun.file(path).text()).split("\n")) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (match && allowed.has(match[1]))
			config[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
	}
	assert.ok([...allowed].every((key) => config[key]));
	assert.equal(config.B2_BUCKET_NAME, bucket);
	assert.equal(config.B2_ENDPOINT, endpoint);
	assert.equal(config.B2_REGION, region);
	return new S3Client({
		endpoint,
		region,
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.B2_APPLICATION_KEY_ID,
			secretAccessKey: config.B2_APPLICATION_KEY,
		},
		maxAttempts: 2,
		requestHandler: { requestTimeout: 20000, connectionTimeout: 10000 },
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
}
export async function inventory(client: S3Client, prefix: string) {
	mediaPrefix(prefix);
	const items: MediaVersion[] = [];
	let keyMarker: string | undefined;
	let versionIdMarker: string | undefined;
	do {
		const page = await client.send(
			new ListObjectVersionsCommand({
				Bucket: bucket,
				Prefix: prefix,
				KeyMarker: keyMarker,
				VersionIdMarker: versionIdMarker,
			}),
		);
		for (const [versions, deleted] of [
			[page.Versions ?? [], false],
			[page.DeleteMarkers ?? [], true],
		] as const)
			for (const item of versions) {
				assert.ok(
					item.Key?.startsWith(prefix) && item.VersionId && item.LastModified,
				);
				items.push({
					key: item.Key!,
					versionId: item.VersionId!,
					deleted,
					latest: !!item.IsLatest,
					modified: item.LastModified!.toISOString(),
				});
			}
		keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
		versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
		assert.ok(!page.IsTruncated || keyMarker);
	} while (keyMarker);
	return items;
}
export async function snapshotMedia(client: S3Client, prefix: string) {
	const before = await inventory(client, prefix);
	for (const item of before) {
		if (item.deleted) continue;
		const result = await client.send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: item.key,
				VersionId: item.versionId,
			}),
		);
		assert.ok(result.Body);
		const content = await result.Body.transformToByteArray();
		assert.ok(content.byteLength <= 2 ** 20, "synthetic_media_limit");
		item.sha256 = hash(content);
		item.content = b64(content);
	}
	const signature = (items: MediaVersion[]) =>
		items
			.map(({ key, versionId, deleted, latest }) =>
				JSON.stringify({ key, versionId, deleted, latest }),
			)
			.sort();
	assert.deepEqual(
		signature(await inventory(client, prefix)),
		signature(before),
		"media_changed_during_backup",
	);
	return before;
}
export async function put(
	client: S3Client,
	prefix: string,
	name: string,
	content: Uint8Array,
) {
	mediaPrefix(prefix);
	assert.match(name, /^(overwritten|deleted)\.bin$/);
	const result = await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: `${prefix}${name}`,
			Body: content,
		}),
	);
	assert.ok(result.VersionId);
	return result.VersionId;
}
export async function seedMedia(client: S3Client, prefix: string) {
	const original = Buffer.from(`Synthetic media ${crypto.randomUUID()}`);
	const first = await put(client, prefix, "overwritten.bin", original);
	await put(client, prefix, "overwritten.bin", Buffer.from("replacement"));
	const deleted = await put(
		client,
		prefix,
		"deleted.bin",
		Buffer.from("deleted original"),
	);
	await client.send(
		new DeleteObjectCommand({ Bucket: bucket, Key: `${prefix}deleted.bin` }),
	);
	return {
		bucket,
		key: `${prefix}overwritten.bin`,
		versionId: first,
		sha256: hash(original),
		deletedVersion: deleted,
	};
}
export async function eraseMedia(client: S3Client, prefix: string) {
	// List only the exact run-owned prefix; delete versions individually, never a bucket/lifecycle rule.
	for (const item of await inventory(client, prefix))
		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: item.key,
				VersionId: item.versionId,
			}),
		);
	assert.equal((await inventory(client, prefix)).length, 0);
}
export async function recoverMedia(
	client: S3Client,
	sourcePrefix: string,
	targetPrefix: string,
	items: MediaVersion[],
) {
	mediaPrefix(sourcePrefix);
	mediaPrefix(targetPrefix);
	assert.ok(targetPrefix.includes("/restore-"));
	assert.notEqual(sourcePrefix, targetPrefix);
	assert.equal(
		(await inventory(client, targetPrefix)).length,
		0,
		"media_target_not_empty",
	);
	const mapping: Record<
		string,
		{ key: string; versionId: string; sha256: string }
	> = {};
	// Restore each independent byte copy, then recreate tombstones. Original version IDs cannot be recreated.
	for (const item of [...items].sort((a, b) =>
		a.modified.localeCompare(b.modified),
	)) {
		assert.ok(item.key.startsWith(sourcePrefix));
		const name = item.key.slice(sourcePrefix.length);
		assert.match(name, /^(overwritten|deleted)\.bin$/);
		if (item.deleted) continue;
		assert.ok(item.content && item.sha256);
		const content = bytes(item.content);
		assert.equal(hash(content), item.sha256);
		const versionId = await put(client, targetPrefix, name, content);
		const key = `${targetPrefix}${name}`;
		const restored = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
		);
		assert.ok(restored.Body);
		assert.equal(hash(await restored.Body.transformToByteArray()), item.sha256);
		mapping[item.versionId] = { key, versionId, sha256: item.sha256 };
	}
	for (const item of items.filter((item) => item.deleted && item.latest))
		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: `${targetPrefix}${item.key.slice(sourcePrefix.length)}`,
			}),
		);
	return mapping;
}
