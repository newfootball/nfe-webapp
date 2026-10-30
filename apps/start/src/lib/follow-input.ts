import { z } from "zod";
import { ProfileIdSchema, validate } from "./profile-input";

export const FollowTargetSchema = ProfileIdSchema;
export const FollowStateSchema = z.strictObject({
	id: ProfileIdSchema.shape.id,
	following: z.boolean(),
});
export const FollowListSchema = z.strictObject({
	direction: z.enum(["followers", "following"]),
	cursor: ProfileIdSchema.shape.id.nullable().default(null),
});
export const validateFollowTarget = (v: unknown) =>
	validate(FollowTargetSchema, v);
export const validateFollowState = (v: unknown) =>
	validate(FollowStateSchema, v);
export const validateFollowList = (v: unknown) => validate(FollowListSchema, v);
export type FollowInput = z.infer<typeof FollowStateSchema>;
export type FollowListInput = z.infer<typeof FollowListSchema>;
