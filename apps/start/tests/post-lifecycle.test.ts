import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	DeletePostSchema,
	PostTransitionSchema,
	PurgeInventorySchema,
	permitsTransition,
	ReplacePostMediaSchema,
	ResumePostLifecycleSchema,
} from "../src/lib/post-lifecycle-contract";
import {
	clearPostLifecycleCache,
	invalidatePostText,
} from "../src/lib/post-text-cache";

const base = { id: "legacy.post-56", expectedRevision: "a".repeat(64) };
const requestId = "f8a22f7d-564e-4be3-bf77-6354c8579fb4";
const legacyId = "cllegacy1234567890abcdef";

test("lifecycle accepts persisted legacy asset IDs but requires UUID operation IDs", () => {
	expect(
		ReplacePostMediaSchema.safeParse({
			...base,
			requestId,
			videoId: legacyId,
			thumbnailId: legacyId,
		}).success,
	).toBe(true);
	expect(
		ReplacePostMediaSchema.safeParse({
			...base,
			requestId: legacyId,
			videoId: requestId,
			thumbnailId: requestId,
		}).success,
	).toBe(false);
	expect(
		DeletePostSchema.safeParse({ ...base, requestId: legacyId }).success,
	).toBe(false);
	expect(
		ResumePostLifecycleSchema.safeParse({ operationId: legacyId }).success,
	).toBe(false);
});

test("owner publication never approves moderated or archived posts", () => {
	for (const from of [
		null,
		"DRAFT",
		"PENDING",
		"REJECTED",
		"PUBLISHED",
		"ARCHIVED",
	]) {
		expect(permitsTransition(from, "PUBLISHED")).toBe(from === "DRAFT");
		expect(permitsTransition(from, "ARCHIVED")).toBe(from === "PUBLISHED");
	}
});
test("lifecycle inputs reject forged authority, uncontrolled fields and stale-token shapes", () => {
	for (const [schema, payload] of [
		[PostTransitionSchema, { ...base, target: "ARCHIVED" }],
		[DeletePostSchema, { ...base, requestId }],
		[
			ReplacePostMediaSchema,
			{ ...base, requestId, videoId: requestId, thumbnailId: requestId },
		],
	] as const) {
		expect(schema.safeParse(payload).success).toBe(true);
		for (const injected of [
			{ ownerId: "victim" },
			{ role: "admin" },
			{ status: "PUBLISHED" },
			{ slug: "replace" },
			{ publishedAt: "2026-01-01" },
			{ expectedRevision: "stale" },
			{ failurePoint: "after-version-delete" },
		])
			expect(schema.safeParse({ ...payload, ...injected }).success).toBe(false);
	}
	for (const target of ["DRAFT", "REJECTED", "PENDING", null])
		expect(PostTransitionSchema.safeParse({ ...base, target }).success).toBe(
			false,
		);
});
test("purge inventory requires concrete versioned objects and stays bounded", () => {
	const asset = {
		id: requestId,
		bucket: "synthetic",
		objectKey: `only-fixture/${requestId}`,
		versionId: "v1",
		sha256: "b".repeat(64),
		versions: [
			{ id: "v1", marker: false },
			{ id: "old-version", marker: false },
			{ id: "marker", marker: true },
		],
	};
	expect(PurgeInventorySchema.parse([asset])[0]?.versions).toHaveLength(3);
	expect(
		PurgeInventorySchema.safeParse([{ ...asset, id: legacyId }]).success,
	).toBe(true);
	expect(
		PurgeInventorySchema.safeParse([{ ...asset, id: "../foreign" }]).success,
	).toBe(false);
	for (const invalid of [
		{ ...asset, versionId: "" },
		{ ...asset, sha256: "unknown" },
		{ ...asset, versions: [] },
		{
			...asset,
			versions: Array.from({ length: 101 }, () => ({ id: "v", marker: false })),
		},
	])
		expect(PurgeInventorySchema.safeParse([invalid]).success).toBe(false);
	expect(
		PurgeInventorySchema.safeParse(Array.from({ length: 11 }, () => asset))
			.success,
	).toBe(false);
});
test("lifecycle invalidates both locales, every feed filter and social/private families", async () => {
	const q = new QueryClient();
	const keys = [
		["feed", "fr", null, "old"],
		["feed", "en", "author", "filter"],
		["post", "fr", base.id],
		["post", "en", base.id],
		["explore", "en", "query", "posts"],
		["public-profile", "author"],
		["own-post", "owner", base.id],
		["own-posts", "owner", null],
		["post-lifecycle", "owner", base.id],
		["interactions", "state", base.id],
		["interactions", "comments", base.id],
		["interactions", "favorites"],
	];
	for (const key of [...keys, ["unrelated-theme"]])
		q.setQueryData(key, { stale: true });
	await invalidatePostText(q);
	for (const key of keys)
		expect(q.getQueryState(key)?.isInvalidated).toBe(true);
	expect(q.getQueryState(["unrelated-theme"])?.isInvalidated).toBe(false);
});

test("withdrawal clears inactive stale details before ensureQueryData can reuse them", async () => {
	const q = new QueryClient();
	q.setQueryData(["post", "fr", "hidden", "public"], { title: "withdrawn" });
	q.setQueryData(["post", "en", "hidden", "public"], { title: "withdrawn" });
	q.setQueryData(["theme"], "dark");
	await clearPostLifecycleCache(q);
	expect(q.getQueryData(["post", "fr", "hidden", "public"])).toBeUndefined();
	expect(q.getQueryData(["post", "en", "hidden", "public"])).toBeUndefined();
	expect(q.getQueryData<string>(["theme"])).toBe("dark");
	let fetched = false;
	const current = await q.ensureQueryData({
		queryKey: ["post", "fr", "hidden", "public"],
		queryFn: async () => {
			fetched = true;
			return null;
		},
	});
	expect(fetched).toBe(true);
	expect(current).toBeNull();
});
