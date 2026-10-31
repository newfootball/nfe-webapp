import { z } from "zod";
import type { Validated } from "./profile-input";

const id = z
	.string()
	.min(1)
	.max(36)
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const PageSchema = z.strictObject({
	viewerId: id,
	cursor: z.string().max(1024).nullable().optional(),
});
const MarkSchema = z.discriminatedUnion("mode", [
	z.strictObject({ viewerId: id, mode: z.literal("one"), id }),
	z.strictObject({ viewerId: id, mode: z.literal("all") }),
]);
function validate<T>(schema: z.ZodType<T>, input: unknown): Validated<T> {
	const r = schema.safeParse(input);
	return r.success ? { valid: true, data: r.data } : { valid: false };
}
export const validateNotificationPage = (input: unknown) =>
	validate(PageSchema, input);
export const validateNotificationMark = (input: unknown) =>
	validate(MarkSchema, input);
export type NotificationPageInput = z.infer<typeof PageSchema>;
export type NotificationMarkInput = z.infer<typeof MarkSchema>;
