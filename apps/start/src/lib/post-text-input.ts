import { z } from "zod";
import { FeedIdSchema } from "./feed-input";
import { validate } from "./profile-input";

export const PostStatusSchema = z
	.enum(["DRAFT", "PUBLISHED", "PENDING", "REJECTED", "ARCHIVED"])
	.nullable();
export const OwnPostsSchema = z.strictObject({
	limit: z.number().int().min(1).max(20).default(10),
	cursor: z.string().max(2000).nullable().default(null),
});
export const OwnPostSchema = z.strictObject({ id: FeedIdSchema });
export const EditPostTextSchema = z.strictObject({
	id: FeedIdSchema,
	expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
	title: z.string().trim().min(1).max(200),
	description: z.string().trim().max(10000),
});
export const OwnCursorSchema = z.strictObject({
	v: z.literal(1),
	owner: FeedIdSchema,
	limit: z.number().int().min(1).max(20),
	time: z.iso.datetime({ precision: 3 }),
	id: FeedIdSchema,
});
export type OwnPostsInput = z.infer<typeof OwnPostsSchema>;
export type EditPostTextInput = z.infer<typeof EditPostTextSchema>;
export const validateOwnPosts = (v: unknown) => validate(OwnPostsSchema, v);
export const validateOwnPost = (v: unknown) => validate(OwnPostSchema, v);
export const validatePostText = (v: unknown) => validate(EditPostTextSchema, v);
export function ownCursor(
	owner: string,
	limit: number,
	time: string,
	id: string,
) {
	return encodeURIComponent(JSON.stringify({ v: 1, owner, limit, time, id }));
}
export function parseOwnCursor(input: OwnPostsInput, owner: string) {
	if (!input.cursor) return null;
	const c = OwnCursorSchema.parse(JSON.parse(decodeURIComponent(input.cursor)));
	if (c.owner !== owner || c.limit !== input.limit)
		throw new Error("Invalid cursor");
	return c;
}
