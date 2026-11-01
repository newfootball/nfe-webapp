import { z } from "zod";
import { FeedIdSchema } from "./feed-input";
import { AssetIdSchema, RequestIdSchema } from "./media-contract";
import { validate } from "./profile-input";

const base = {
	id: FeedIdSchema,
	expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
};
export const PostTransitionSchema = z.strictObject({
	...base,
	target: z.enum(["PUBLISHED", "ARCHIVED"]),
});
export const ReplacePostMediaSchema = z.strictObject({
	...base,
	requestId: RequestIdSchema,
	videoId: AssetIdSchema,
	thumbnailId: AssetIdSchema,
});
export const DeletePostSchema = z.strictObject({
	...base,
	requestId: RequestIdSchema,
});
export const ResumePostLifecycleSchema = z.strictObject({
	operationId: RequestIdSchema,
});
export const validateTransition = (v: unknown) =>
	validate(PostTransitionSchema, v);
export const validateReplacement = (v: unknown) =>
	validate(ReplacePostMediaSchema, v);
export const validateDeletion = (v: unknown) => validate(DeletePostSchema, v);
export const validateLifecycleResume = (v: unknown) =>
	validate(ResumePostLifecycleSchema, v);
export type PostTransition = z.infer<typeof PostTransitionSchema>;
export type ReplacePostMedia = z.infer<typeof ReplacePostMediaSchema>;
export type DeletePost = z.infer<typeof DeletePostSchema>;
export function permitsTransition(
	from: string | null,
	to: PostTransition["target"],
) {
	return (
		(from === "DRAFT" && to === "PUBLISHED") ||
		(from === "PUBLISHED" && to === "ARCHIVED")
	);
}
// Only these known versions may be purged. Never infer a bucket or broad prefix delete.
export const PurgeAssetSchema = z.strictObject({
	id: AssetIdSchema,
	bucket: z.string().min(1),
	objectKey: z.string().min(1).max(1024),
	versionId: z.string().min(1).max(1024),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	versions: z
		.array(
			z.strictObject({ id: z.string().min(1).max(1024), marker: z.boolean() }),
		)
		.min(1)
		.max(100),
});
export const PurgeInventorySchema = z.array(PurgeAssetSchema).max(10);
export type PurgeAsset = z.infer<typeof PurgeAssetSchema>;
export type LifecycleProgress = {
	operationId: string;
	done: boolean;
	phase: string;
};
