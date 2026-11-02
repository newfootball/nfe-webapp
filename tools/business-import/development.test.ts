import { expect, test } from "bun:test";
import { deriveDevelopmentImport } from "./development";
import type { MediaPlan } from "./media-plan";
import type { BusinessSource } from "./source";

test("quarantines whole media and avatar pairs without changing other records or the source", () => {
	const source = {
		User: [{ id: "u", image: "private-url" }],
		Media: [{ id: "m", postId: "p" }],
		Post: [{ id: "p" }],
		Account: [{ id: "a" }],
		Like: [{ id: "l" }],
		Message: [{ id: "message" }],
	} as unknown as BusinessSource;
	const before = structuredClone(source);
	const asset = (id: string, source: "media" | "avatar", sourceId: string) => ({
		id,
		provenance: { source, id: sourceId },
	});
	const plan = {
		bucket: "dev",
		prefix: "dev/",
		assets: [
			asset("m", "media", "m"),
			asset("mo", "media", "m"),
			asset("av", "avatar", "u"),
			asset("avo", "avatar", "u"),
		],
	} as MediaPlan;
	const result = deriveDevelopmentImport(source, plan, {
		prepared: [{ assetId: "m" }, { assetId: "av" }],
		quarantine: [
			{ assetId: "mo", urlHash: "h", reason: "http_404" },
			{ assetId: "avo", urlHash: "h", reason: "http_403" },
		],
		ready: false,
	} as never);
	expect(source).toEqual(before);
	expect(result.source.Media).toEqual([]);
	expect(result.source.User[0]?.image).toBeNull();
	expect(result.source.Post).toEqual(source.Post);
	expect(result.source.Like).toEqual(source.Like);
	expect(result.source.Message).toEqual(source.Message);
	expect(result.plan.assets).toEqual([]);
	expect(result.prepared).toEqual([]);
	expect(result.omissions).toEqual([
		{
			source: "media",
			sourceId: "m",
			assetIds: ["m", "mo"],
			missing: [{ assetId: "mo", reason: "http_404" }],
		},
		{
			source: "avatar",
			sourceId: "u",
			assetIds: ["av", "avo"],
			missing: [{ assetId: "avo", reason: "http_403" }],
		},
	]);
	expect(result.complete).toBe(true);
});
