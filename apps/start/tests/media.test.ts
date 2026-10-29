import { describe, expect, test } from "bun:test";
import {
	AllocateAssetSchema,
	AssetRequestSchema,
	canonicalImage,
	PostMediaRequestSchema,
	PublishPostSchema,
} from "../src/lib/media-contract";
import {
	acceptsOperationResult,
	expectedPartBytes,
	inspectContent,
	inspectParts,
	isOwnerOnlyBucketAcl,
} from "../src/lib/media-policy";

test("private bucket proof fails closed on public, group, foreign and ambiguous ACLs", () => {
	const owner = { Owner: { ID: "fixture-owner" } };
	const grant = {
		Permission: "FULL_CONTROL",
		Grantee: { Type: "CanonicalUser", ID: "fixture-owner" },
	};
	expect(isOwnerOnlyBucketAcl({ ...owner, Grants: [grant] })).toBe(true);
	for (const acl of [
		null,
		{},
		{ ...owner, Grants: [] },
		{ ...owner, Grants: [grant, grant] },
		{ ...owner, Grants: [{ ...grant, Permission: "READ" }] },
		{
			...owner,
			Grants: [
				{
					...grant,
					Grantee: {
						Type: "Group",
						URI: "http://acs.amazonaws.com/groups/global/AllUsers",
					},
				},
			],
		},
		{
			...owner,
			Grants: [{ ...grant, Grantee: { Type: "CanonicalUser", ID: "foreign" } }],
		},
	])
		expect(isOwnerOnlyBucketAcl(acl)).toBe(false);
});

test("operation generations survive expired worker, recovery and replacement interleavings", () => {
	const current = {
		state: "FINALIZING",
		leaseUntil: "2026-10-29T18:00:00.000Z",
		metadataJson: JSON.stringify({ operationToken: "worker-A" }),
	};
	const before = Date.parse("2026-10-29T17:59:00.000Z"),
		after = Date.parse("2026-10-29T18:01:00.000Z");
	expect(
		acceptsOperationResult(current, "FINALIZING", "worker-A", before),
	).toBe(true);
	expect(acceptsOperationResult(current, "FINALIZING", "worker-A", after)).toBe(
		false,
	);
	const replacement = {
		...current,
		leaseUntil: "2026-10-29T18:11:00.000Z",
		metadataJson: JSON.stringify({ operationToken: "worker-B" }),
	};
	expect(
		acceptsOperationResult(replacement, "FINALIZING", "worker-A", after),
	).toBe(false);
	expect(
		acceptsOperationResult(replacement, "FINALIZING", "worker-B", after),
	).toBe(true);
	expect(
		acceptsOperationResult(
			{ ...replacement, state: "CANCELLED", metadataJson: null },
			"FINALIZING",
			"worker-B",
			after,
		),
	).toBe(false);
});

const id = "12345678-1234-4234-8234-123456789abc";
describe("untrusted media inputs", () => {
	test("preserves delivered legacy post IDs containing internal dots", () => {
		expect(
			PostMediaRequestSchema.safeParse({
				postId: "legacy.post-1",
				kind: "video",
			}).success,
		).toBe(true);
		for (const postId of [".leading", "../foreign", "a/b", "a?b"])
			expect(
				PostMediaRequestSchema.safeParse({ postId, kind: "video" }).success,
			).toBe(false);
	});
	test("rejects injected storage, owner, status and upload identifiers", () => {
		const valid = {
			requestId: id,
			kind: "video",
			byteSize: 12,
			sha256: "a".repeat(64),
			mimetype: "video/mp4",
		};
		expect(AllocateAssetSchema.safeParse(valid).success).toBe(true);
		for (const key of [
			"bucket",
			"key",
			"url",
			"ownerId",
			"uploadId",
			"status",
			"versionId",
		])
			expect(
				AllocateAssetSchema.safeParse({ ...valid, [key]: "foreign" }).success,
			).toBe(false);
		expect(
			AssetRequestSchema.safeParse({ assetId: "../foreign" }).success,
		).toBe(false);
		expect(
			PublishPostSchema.safeParse({
				requestId: id,
				videoId: id,
				thumbnailId: id,
				title: "test",
				description: "",
				status: "PUBLISHED",
			}).success,
		).toBe(false);
	});
	test("allows only canonical image descriptors", () => {
		expect(canonicalImage(`/media/${id}`)).toBe(`/media/${id}`);
		for (const url of [
			"https://evil.test/image.webp",
			"//evil.test/x",
			"/media/../a",
			`/media/${id}?signature=secret`,
			"data:image/svg+xml,x",
		])
			expect(canonicalImage(url)).toBeNull();
	});
});
test("multipart exact sizes, incomplete parts and ETags are server-inspected", () => {
	const size = 5 * 1024 ** 2 + 7;
	expect(expectedPartBytes(size, 2)).toBe(7);
	expect(() => expectedPartBytes(size, 3)).toThrow();
	expect(
		inspectParts(
			size,
			[
				{ PartNumber: 2, Size: 7, ETag: "b" },
				{ PartNumber: 1, Size: 5 * 1024 ** 2, ETag: "a" },
			],
			true,
		).map((p) => p.number),
	).toEqual([1, 2]);
	for (const parts of [
		[{ PartNumber: 1, Size: 7, ETag: "a" }],
		[
			{ PartNumber: 2, Size: 7, ETag: "a" },
			{ PartNumber: 2, Size: 7, ETag: "b" },
		],
		[{ PartNumber: 1, Size: 5 * 1024 ** 2, ETag: "a" }],
	])
		expect(() => inspectParts(size, parts, true)).toThrow();
});
test("content policy rejects unsupported containers, codecs, streams and dimensions", () => {
	const stream = {
		codec_type: "video",
		codec_name: "h264",
		pix_fmt: "yuv420p",
		width: 640,
		height: 360,
	};
	expect(
		inspectContent(
			"video",
			{
				streams: [stream, { codec_type: "audio", codec_name: "aac" }],
				format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "6" },
			},
			180,
		).codec,
	).toBe("h264");
	for (const patch of [
		{ codec_name: "hevc" },
		{ pix_fmt: "yuv444p" },
		{ width: 8000 },
	])
		expect(() =>
			inspectContent(
				"video",
				{
					streams: [{ ...stream, ...patch }],
					format: { format_name: "mp4", duration: "6" },
				},
				180,
			),
		).toThrow();
	expect(() =>
		inspectContent(
			"video",
			{
				streams: [stream],
				format: { format_name: "mp4", duration: "Infinity" },
			},
			180,
		),
	).toThrow();
	expect(() =>
		inspectContent(
			"video",
			{
				streams: [stream, { codec_type: "attachment" }],
				format: { format_name: "mp4", duration: "6" },
			},
			180,
		),
	).toThrow();
	expect(
		inspectContent(
			"avatar",
			{
				streams: [{ ...stream, codec_name: "webp" }],
				format: { format_name: "webp_pipe" },
			},
			180,
		).codec,
	).toBe("webp");
});
