import { z } from "zod";
import { RequestIdSchema } from "./media-contract";
import { validate } from "./profile-input";

// The account ID is always derived from the authenticated session. In particular,
// a browser cannot select another account, object key, or lifecycle phase.
export const StartAccountDeletionSchema = z.strictObject({
	requestId: RequestIdSchema,
	confirmation: z.literal("DELETE_ALL_SENT_RECEIVED"),
});
export const ResumeAccountDeletionSchema = z.strictObject({
	operationId: RequestIdSchema,
});
export const validateStartAccountDeletion = (value: unknown) =>
	validate(StartAccountDeletionSchema, value);
export const validateResumeAccountDeletion = (value: unknown) =>
	validate(ResumeAccountDeletionSchema, value);
export type StartAccountDeletion = z.infer<typeof StartAccountDeletionSchema>;
