import { z } from "zod";

export const AssetIdSchema = z.string().uuid();
export const AssetKindSchema = z.enum(["video", "thumbnail", "avatar"]);
export const AssetStateSchema = z.enum([
	"ALLOCATED",
	"UPLOADING",
	"FINALIZING",
	"READY",
	"ATTACHED",
	"CANCELLED",
	"REJECTED",
]);
export const AllocateAssetSchema = z.strictObject({
	// Stable across retries. A different file must use a new requestId.
	requestId: AssetIdSchema,
	kind: AssetKindSchema,
	byteSize: z
		.number()
		.int()
		.positive()
		.max(512 * 1024 * 1024),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	mimetype: z.enum(["video/mp4", "image/webp"]),
});
export const AssetRequestSchema = z.strictObject({ assetId: AssetIdSchema });
export const PartRequestSchema = AssetRequestSchema.extend({
	partNumber: z.number().int().min(1).max(103),
});
export const PostMediaRequestSchema = z.strictObject({
	postId: z.string().regex(/^[a-zA-Z0-9_-]{1,36}$/),
	kind: z.enum(["video", "thumbnail"]),
});
export const PublishPostSchema = z.strictObject({
	requestId: AssetIdSchema,
	title: z.string().trim().min(1).max(200),
	description: z.string().trim().max(10_000),
	videoId: AssetIdSchema,
	thumbnailId: AssetIdSchema,
});
export const MEDIA_PART_BYTES = 5 * 1024 * 1024;
export const MEDIA_READ_TTL_SECONDS = 120;
export type AssetKind = z.infer<typeof AssetKindSchema>;
export type AssetState = z.infer<typeof AssetStateSchema>;
export type AllocateAsset = z.infer<typeof AllocateAssetSchema>;
export type PublishPost = z.infer<typeof PublishPostSchema>;
export type AssetRequest = z.infer<typeof AssetRequestSchema>;
export type PartRequest = z.infer<typeof PartRequestSchema>;
export type UploadAsset = {
	id: string;
	kind: AssetKind;
	state: AssetState;
	byteSize: number;
	sha256: string;
	partBytes: number;
	parts: { number: number; bytes: number; etag: string }[];
};
export type MediaResult<T> =
	| { ok: true; value: T }
	| {
			ok: false;
			error:
				| "unauthorized"
				| "forbidden"
				| "invalid"
				| "origin"
				| "unavailable"
				| "conflict";
	  };
export type MediaRead = { url: string; expiresAt: number; mimetype: string };
// Public descriptors contain no storage location and never expire.
export const mediaPath = (assetId: string) =>
	`/media/${AssetIdSchema.parse(assetId)}`;
export function canonicalImage(value: string | null) {
	return value === "/logo.svg" ||
		(value !== null &&
			/^\/media\/[a-f0-9-]{36}$/.test(value) &&
			AssetIdSchema.safeParse(value.slice(7)).success)
		? value
		: null;
}
export const postMediaPath = (postId: string, kind: "video" | "thumbnail") =>
	`/post-media/${encodeURIComponent(postId)}/${kind}`;
