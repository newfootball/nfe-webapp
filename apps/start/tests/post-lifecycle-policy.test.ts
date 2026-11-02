import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import type { Models } from "node-appwrite";

mock.module("@tanstack/react-start/server-only", () => ({}));
const { eligiblePostAsset } = await import(
	"../src/lib/post-lifecycle-policy.server"
);
const delivery = {
	$id: "media1",
	ownerId: "owner",
	postId: "post",
	kind: "video",
	state: "ATTACHED",
} as unknown as Models.DefaultRow;
const archive = {
	$id: `orig_${createHash("sha256")
		.update(JSON.stringify(["media", "media1"]))
		.digest("hex")
		.slice(0, 31)}`,
	ownerId: "owner",
	postId: "post",
	kind: "original-video",
	state: "REJECTED",
	metadataJson: JSON.stringify({
		role: "original",
		source: "media",
		sourceId: "media1",
	}),
} as unknown as Models.DefaultRow;
test("only a matching rejected original and attached delivery can enter the purge inventory", () => {
	expect(eligiblePostAsset(delivery, [delivery, archive])).toBe(true);
	expect(eligiblePostAsset(archive, [delivery, archive])).toBe(true);
	for (const changed of [
		{ ...archive, $id: "foreign" },
		{ ...archive, ownerId: "other" },
		{ ...archive, postId: "other" },
		{ ...archive, metadataJson: "{}" },
		{ ...archive, kind: "original-thumbnail" },
		{ ...archive, state: "READY" },
	])
		expect(eligiblePostAsset(changed, [delivery, changed])).toBe(false);
	expect(eligiblePostAsset(archive, [archive])).toBe(false);
});
