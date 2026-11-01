import { z } from "zod";
import { AssetIdSchema } from "./media-contract";
import { validate } from "./profile-input";

// The account ID is always derived from the authenticated session. In particular,
// a browser cannot select another account, object key, or lifecycle phase.
export const StartAccountDeletionSchema = z.strictObject({
	requestId: AssetIdSchema,
	confirmation: z.literal("DELETE_ALL_SENT_RECEIVED"),
});
export const ResumeAccountDeletionSchema = z.strictObject({
	operationId: AssetIdSchema,
});
export const validateStartAccountDeletion = (value: unknown) =>
	validate(StartAccountDeletionSchema, value);
export const validateResumeAccountDeletion = (value: unknown) =>
	validate(ResumeAccountDeletionSchema, value);
export type StartAccountDeletion = z.infer<typeof StartAccountDeletionSchema>;
