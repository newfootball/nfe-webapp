import { z } from "zod";

const locale = z.enum(["fr", "en"]);
const password = z.string().min(8).max(256);
export const requestSchema = z.strictObject({
	email: z.email().max(254),
	locale,
});
export const resetSchema = z.strictObject({ password, locale });
export const changeSchema = z.strictObject({
	oldPassword: password,
	password,
	locale,
});
export const localeSchema = z.strictObject({ locale });
export function recoveryInput<T>(
	schema: z.ZodType<T>,
	value: unknown,
): { valid: true; data: T } | { valid: false } {
	const parsed = schema.safeParse(value);
	return parsed.success ? { valid: true, data: parsed.data } : { valid: false };
}
export const challengeSchema = z.strictObject({
	userId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/),
	secret: z.string().min(1).max(512),
	kind: z.enum(["reset", "verify"]),
	locale,
});
