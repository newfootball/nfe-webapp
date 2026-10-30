import { z } from "zod";
import { PostStatusSchema } from "./post-text-input";

const date = z.string().transform((v) => new Date(v).toISOString());
export const OwnPostRowSchema = z.object({
	$id: z.string(),
	userId: z.string(),
	slug: z.string(),
	title: z.string(),
	description: z.string(),
	type: z.string().nullable(),
	status: PostStatusSchema,
	createdAt: date,
	updatedAt: date,
	publishedAt: date.nullable(),
	expiresAt: date.nullable(),
	validatedAt: date.nullable(),
});
export function ownPostDTO(row: unknown, revision: string) {
	const { $id, ...p } = OwnPostRowSchema.parse(row);
	return { id: $id, ...p, revision };
}
export type OwnPost = ReturnType<typeof ownPostDTO>;
export type OwnPostsPage = {
	ownerId: string;
	posts: OwnPost[];
	nextCursor: string | null;
};
export type PostTextError =
	| "unauthorized"
	| "forbidden"
	| "origin"
	| "invalid"
	| "unavailable"
	| "conflict"
	| "notFound";
export type PostTextResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: PostTextError };
