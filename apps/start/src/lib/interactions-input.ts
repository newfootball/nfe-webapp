import { z } from "zod";
import { ProfileIdSchema, validate } from "./profile-input";

const id = ProfileIdSchema.shape.id;
export const InteractionTargetSchema = z.strictObject({ id });
export const InteractionPairSchema = z.strictObject({
	id,
	kind: z.enum(["like", "favorite"]),
	active: z.boolean(),
});
export const CommentCreateSchema = z.strictObject({
	id,
	requestId: z.string().uuid(),
	content: z.string().trim().min(1).max(1000),
});
export const CommentDeleteSchema = z.strictObject({ id, commentId: id });
export const InteractionPageSchema = z.strictObject({
	id,
	cursor: z.string().max(1500).nullable().default(null),
});
export const FavoritePageSchema = z.strictObject({
	cursor: z.string().max(1500).nullable().default(null),
});
export const validateInteractionTarget = (v: unknown) =>
	validate(InteractionTargetSchema, v);
export const validateInteractionPair = (v: unknown) =>
	validate(InteractionPairSchema, v);
export const validateCommentCreate = (v: unknown) =>
	validate(CommentCreateSchema, v);
export const validateCommentDelete = (v: unknown) =>
	validate(CommentDeleteSchema, v);
export const validateInteractionPage = (v: unknown) =>
	validate(InteractionPageSchema, v);
export const validateFavoritePage = (v: unknown) =>
	validate(FavoritePageSchema, v);
export type PairInput = z.infer<typeof InteractionPairSchema>;
export type CommentInput = z.infer<typeof CommentCreateSchema>;
export type DeleteInput = z.infer<typeof CommentDeleteSchema>;
export type PageInput = z.infer<typeof InteractionPageSchema>;
export type FavoriteInput = z.infer<typeof FavoritePageSchema>;

const CursorSchema = z.strictObject({
	version: z.literal(1),
	scope: z.string().max(100),
	time: z.iso.datetime({ precision: 3 }),
	id: ProfileIdSchema.shape.id,
});
export function interactionCursor(scope: string, time: string, id: string) {
	return encodeURIComponent(
		JSON.stringify({
			version: 1,
			scope,
			time: new Date(time).toISOString(),
			id,
		}),
	);
}
export function parseInteractionCursor(scope: string, value: string | null) {
	if (!value) return null;
	const cursor = CursorSchema.parse(JSON.parse(decodeURIComponent(value)));
	if (cursor.scope !== scope) throw new Error("Invalid cursor scope");
	return cursor;
}
