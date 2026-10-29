import { z } from "zod";

const LoginSchema = z.strictObject({
	email: z.email().max(254),
	password: z.string().min(8).max(256),
});
const NameSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });
const SignupSchema = LoginSchema.extend(NameSchema.shape);

export type AuthInput<T> = { valid: true; data: T } | { valid: false };
function validate<T>(schema: z.ZodType<T>, input: unknown): AuthInput<T> {
	const result = schema.safeParse(input);
	// Do not return Zod issues: they can contain submitted credentials.
	return result.success ? { valid: true, data: result.data } : { valid: false };
}
export const validateLogin = (input: unknown) => validate(LoginSchema, input);
export const validateSignup = (input: unknown) => validate(SignupSchema, input);
export const validateName = (input: unknown) => validate(NameSchema, input);
