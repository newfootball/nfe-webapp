import assert from "node:assert/strict";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectVersionsCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { b64, bytes, hash, local, privateDir, privateWrite } from "./core.mts";

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
	assert.match(prefix, /^nfe-backup-47\/(source|restore)-[a-f0-9]{32}\/$/);
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
export type MediaJournal = {
	prefix: string;
	created: { key: string; versionId: string }[];
};
export const journalFor = (prefix: string): MediaJournal => ({
	prefix: mediaPrefix(prefix),
	created: [],
});
async function record(
	journal: MediaJournal,
	key: string,
	versionId: string | undefined,
) {
	assert.ok(
		key.startsWith(journal.prefix) && versionId,
		"missing_created_version_identity",
	);
	journal.created.push({ key, versionId });
	await privateDir(local);
	await privateWrite(
		`${local}/${journal.prefix.split("/")[1]}.journal.json`,
		JSON.stringify(journal),
	);
}
export async function emptyPrefixes(client: S3Client, prefixes: string[]) {
	for (const prefix of prefixes)
		assert.equal(
			(await inventory(client, prefix)).length,
			0,
			"media_prefix_occupied",
		);
}
export async function put(
	client: S3Client,
	journal: MediaJournal,
	name: string,
	content: Uint8Array,
) {
	mediaPrefix(journal.prefix);
	assert.match(name, /^(overwritten|deleted)\.bin$/);
	const key = `${journal.prefix}${name}`;
	const result = await client.send(
		new PutObjectCommand({ Bucket: bucket, Key: key, Body: content }),
	);
	await record(journal, key, result.VersionId);
	return result.VersionId!;
}
async function tombstone(
	client: S3Client,
	journal: MediaJournal,
	name: string,
) {
	assert.match(name, /^(overwritten|deleted)\.bin$/);
	const key = `${journal.prefix}${name}`;
	const result = await client.send(
		new DeleteObjectCommand({ Bucket: bucket, Key: key }),
	);
	await record(journal, key, result.VersionId);
}
export async function seedMedia(client: S3Client, journal: MediaJournal) {
	await emptyPrefixes(client, [journal.prefix]);
	const original = Buffer.from(`Synthetic media ${crypto.randomUUID()}`);
	const first = await put(client, journal, "overwritten.bin", original);
	await put(client, journal, "overwritten.bin", Buffer.from("replacement"));
	const deleted = await put(
		client,
		journal,
		"deleted.bin",
		Buffer.from("deleted original"),
	);
	await tombstone(client, journal, "deleted.bin");
	return {
		bucket,
		key: `${journal.prefix}overwritten.bin`,
		versionId: first,
		sha256: hash(original),
		deletedVersion: deleted,
	};
}
export async function eraseMedia(client: S3Client, journal: MediaJournal) {
	mediaPrefix(journal.prefix);
	// Never inventory for deletion: the API receipts are the sole cleanup authority.
	while (journal.created.length) {
		const item = journal.created[journal.created.length - 1]!;
		assert.ok(item.key.startsWith(journal.prefix) && item.versionId);
		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: item.key,
				VersionId: item.versionId,
			}),
		);
		journal.created.pop();
	}
}
export function validateMedia(sourcePrefix: string, items: MediaVersion[]) {
	mediaPrefix(sourcePrefix);
	const groups = new Map<string, MediaVersion[]>();
	for (const item of items) {
		assert.ok(item.key.startsWith(sourcePrefix) && item.versionId);
		assert.match(
			item.key.slice(sourcePrefix.length),
			/^(overwritten|deleted)\.bin$/,
		);
		assert.ok(Number.isFinite(Date.parse(item.modified)));
		if (!item.deleted) {
			assert.ok(item.content && item.sha256);
			assert.equal(hash(bytes(item.content)), item.sha256);
		}
		groups.set(item.key, [...(groups.get(item.key) ?? []), item]);
	}
	for (const versions of groups.values())
		assert.equal(
			versions.filter((v) => v.latest).length,
			1,
			"ambiguous_latest",
		);
	return groups;
}
export async function recoverMedia(
	client: S3Client,
	sourcePrefix: string,
	targetPrefix: string,
	items: MediaVersion[],
	journal = journalFor(targetPrefix),
) {
	mediaPrefix(targetPrefix);
	assert.equal(journal.prefix, targetPrefix);
	assert.ok(
		targetPrefix.includes("/restore-") && sourcePrefix !== targetPrefix,
	);
	const groups = validateMedia(sourcePrefix, items);
	await emptyPrefixes(client, [targetPrefix]);
	const mapping: Record<
		string,
		{ key: string; versionId: string; sha256: string }
	> = {};
	for (const [sourceKey, versions] of groups) {
		const name = sourceKey.slice(sourcePrefix.length);
		// Latest is always replayed last, even when timestamp precision ties; replay historical tombstones too.
		for (const item of [...versions].sort(
			(a, b) =>
				Number(a.latest) - Number(b.latest) ||
				a.modified.localeCompare(b.modified),
		)) {
			if (item.deleted) {
				await tombstone(client, journal, name);
				continue;
			}
			const versionId = await put(client, journal, name, bytes(item.content!));
			const key = `${targetPrefix}${name}`;
			const restored = await client.send(
				new GetObjectCommand({
					Bucket: bucket,
					Key: key,
					VersionId: versionId,
				}),
			);
			assert.ok(restored.Body);
			assert.equal(
				hash(await restored.Body.transformToByteArray()),
				item.sha256,
			);
			mapping[item.versionId] = { key, versionId, sha256: item.sha256! };
		}
	}
	const final = await inventory(client, targetPrefix);
	assert.equal(final.length, items.length);
	for (const [sourceKey, versions] of groups) {
		const expected = versions.find((v) => v.latest)!;
		const key = `${targetPrefix}${sourceKey.slice(sourcePrefix.length)}`;
		const actual = final.filter((v) => v.key === key);
		assert.equal(actual.length, versions.length);
		assert.equal(
			actual.filter((v) => v.deleted).length,
			versions.filter((v) => v.deleted).length,
		);
		const latest = actual.filter((v) => v.latest);
		assert.equal(latest.length, 1);
		assert.equal(latest[0]!.deleted, expected.deleted);
		if (!expected.deleted) {
			const current = await client.send(
				new GetObjectCommand({ Bucket: bucket, Key: key }),
			);
			assert.ok(current.Body);
			assert.equal(
				hash(await current.Body.transformToByteArray()),
				expected.sha256,
				"current_bytes_mismatch",
			);
		}
	}
	return mapping;
}
