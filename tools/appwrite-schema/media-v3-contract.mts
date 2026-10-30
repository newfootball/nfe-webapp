import type { Table } from "./schema.mts";

const text = (size = 255, required = true) => ({
	type: "string" as const,
	size,
	required,
});
export const mediaV3Version = "v3-media-allocations";
// Separate from post media: uploads and avatars never invent a parent post.
export const mediaV3Tables: Record<string, Table> = {
	media_assets: {
		columns: {
			leaseUntil: { type: "datetime", required: false },
			ownerId: text(),
			kind: text(32),
			state: text(32),
			provider: text(32),
			bucket: text(),
			objectKey: text(1024),
			uploadId: text(1024, false),
			versionId: text(1024, false),
			byteSize: { type: "integer", required: true },
			sha256: text(64),
			mimetype: text(128),
			postId: text(36, false),
			metadataJson: text(4096, false),
			createdAt: { type: "datetime", required: true },
			updatedAt: { type: "datetime", required: true },
		},
		indexes: [
			{ key: "owner_state", columns: ["ownerId", "state"], type: "key" },
			{ key: "post_kind", columns: ["postId", "kind"], type: "unique" },
			{ key: "updated", columns: ["updatedAt"], type: "key" },
		],
	},
};
export const mediaV3Digest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(mediaV3Tables))
	.digest("hex");
