import { describe, expect, test } from "bun:test";
import { buildMediaManifest, createMediaPlan } from "./media-plan";
import type { BusinessSource } from "./source";

const time = "2026-01-01T00:00:00.000Z";
const config = {
	allowedHosts: ["res.cloudinary.com"],
	bucket: "bucket",
	prefix: "private/",
};
function source(): BusinessSource {
	return {
		User: [
			{
				id: "user",
				image: "https://res.cloudinary.com/demo/image/upload/avatar.jpg",
				createdAt: time,
				updatedAt: time,
			},
		],
		Post: [{ id: "post", userId: "user" }],
		Media: [
			{
				id: "video",
				postId: "post",
				type: "mainVideo",
				mimetype: "video/mp4",
				url: "https://res.cloudinary.com/demo/video/upload/movie.mp4",
				createdAt: time,
				updatedAt: time,
			},
			{
				id: "image",
				postId: "post",
				type: "mainVideo",
				mimetype: "image/jpeg",
				url: "https://res.cloudinary.com/demo/image/upload/photo.jpg",
				createdAt: time,
				updatedAt: time,
			},
		],
	} as unknown as BusinessSource;
}
function uploads(plan: ReturnType<typeof createMediaPlan>) {
	return plan.assets.map((a) => ({
		assetId: a.id,
		bucket: plan.bucket,
		objectKey: `${plan.prefix}business-import/${a.id}`,
		versionId: "v1",
		byteSize: 123,
		sha256: "a".repeat(64),
		mimetype: a.mimetype ?? "image/jpeg",
	}));
}
describe("private media import plan", () => {
	test("keeps mislabeled images, original provenance and owner-scoped archive rows", () => {
		const plan = createMediaPlan(source(), config);
		expect(plan.assets).toHaveLength(6);
		expect(plan.assets.find((a) => a.id === "image")).toMatchObject({
			kind: "thumbnail",
			postId: "post",
			provenance: { type: "mainVideo" },
			mimetype: "image/webp",
		});
		expect(plan.assets.find((a) => a.id === "image")?.fetchUrl).toContain(
			"/upload/f_webp,q_auto/",
		);
		expect(plan.assets.find((a) => a.id === "video")?.fetchUrl).toContain(
			"/upload/f_mp4/",
		);
		expect(
			plan.assets
				.filter((a) => a.role === "original")
				.every(
					(a) =>
						a.postId === (a.provenance.source === "media" ? "post" : null) &&
						a.ownerId === "user" &&
						a.fetchUrl === a.provenance.url,
				),
		).toBe(true);
		expect(createMediaPlan(source(), config)).toEqual(plan);
		const rows = buildMediaManifest(plan, uploads(plan));
		expect(rows).toHaveLength(6);
		expect(JSON.stringify(rows)).not.toContain("cloudinary");
		expect(rows.filter((r) => r.postId === null)).toHaveLength(2);
		expect(
			rows
				.filter((r) => r.kind.startsWith("original-"))
				.map((r) => r.kind)
				.sort(),
		).toEqual(["original-avatar", "original-thumbnail", "original-video"]);
	});
	test("retains actual MIME for untransformed delivery and normalizes UTC dates", () => {
		const input = source();
		const media = input.Media[1];
		if (!media) throw new Error("missing fixture");
		media.url = "https://assets.example.test/photo.jpg";
		media.createdAt = "2026-01-01T01:02:03";
		const plan = createMediaPlan(input, {
			...config,
			allowedHosts: [...config.allowedHosts, "assets.example.test"],
		});
		expect(plan.assets.find((asset) => asset.id === "image")?.mimetype).toBe(
			"image/jpeg",
		);
		const rows = buildMediaManifest(plan, uploads(plan));
		expect(rows.find((row) => row.id === "image")?.createdAt).toBe(
			"2026-01-01T01:02:03.000Z",
		);
		expect(rows.filter((row) => row.state === "REJECTED")).toHaveLength(3);
	});
	test("rejects untrusted URLs and unsafe configuration", () => {
		for (const url of [
			"http://res.cloudinary.com/a",
			"https://user@res.cloudinary.com/a",
			"https://res.cloudinary.com:444/a",
			"https://res.cloudinary.com:443/a",
			"https://127.0.0.1/a",
			"https://evil.test/a",
			"https://localhost/a",
		]) {
			const s = source();
			const media = s.Media[0];
			if (!media) throw new Error("missing fixture");
			media.url = url;
			expect(() => createMediaPlan(s, config)).toThrow();
		}
		expect(() =>
			createMediaPlan(source(), { ...config, allowedHosts: ["127.0.0.1"] }),
		).toThrow();
	});
	test("requires complete, correctly scoped versioned metadata", () => {
		const plan = createMediaPlan(source(), config);
		const objects = uploads(plan);
		const first = objects[0];
		if (!first) throw new Error("missing fixture");
		for (const change of [
			{ bucket: "other" },
			{ objectKey: "private/other" },
			{ versionId: "" },
			{ byteSize: 0 },
			{ sha256: "x" },
			{ mimetype: "image/jpeg" },
		]) {
			expect(() =>
				buildMediaManifest(plan, [
					{ ...first, ...change },
					...objects.slice(1),
				]),
			).toThrow();
		}
		expect(() => buildMediaManifest(plan, objects.slice(1))).toThrow();
	});
});
