import { z } from "zod";
import { POSITIONS } from "./profile-contract";

const text = (max: number) => z.string().trim().max(max);
const birthday = z.iso
	.date()
	.refine(
		(v) => v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10),
	);
const position = z
	.enum([...POSITIONS, "DEFENDER", "MIDFIELDER", "FORWARD"])
	.transform(
		(v) =>
			({
				DEFENDER: "CENTRE_BACK",
				MIDFIELDER: "CENTRE_MIDFIELDER",
				FORWARD: "CENTRE_FORWARD",
			})[v as "DEFENDER"] ?? v,
	);
const positions = z
	.array(position)
	.max(11)
	.refine((v) => new Set(v).size === v.length);
const feet = z
	.array(z.enum(["LEFT", "RIGHT"]))
	.max(2)
	.refine((v) => new Set(v).size === v.length);
const common = {
	name: text(128).min(2),
	city: text(255).min(2),
	biography: text(65535),
};
export const OnboardingSchema = z.discriminatedUnion("userType", [
	z.strictObject({ ...common, userType: z.literal("USER") }),
	z.strictObject({
		...common,
		userType: z.literal("PLAYER"),
		birthDate: birthday,
		position: positions.min(1),
		foot: z.enum(["LEFT", "RIGHT", "BOTH"]),
		license: text(255),
	}),
	z.strictObject({
		...common,
		userType: z.literal("COACH"),
		birthDate: birthday,
		clubName: text(255).min(2),
	}),
	z.strictObject({
		...common,
		userType: z.literal("RECRUITER"),
		birthDate: birthday,
		clubName: text(255).min(2),
	}),
	z.strictObject({
		...common,
		userType: z.literal("CLUB"),
		clubName: text(255).min(2),
		clubSize: z.number().int().min(1).max(2147483647),
		clubPosition: text(255).min(2),
	}),
]);
export const EditProfileSchema = z.strictObject({
	name: common.name,
	biography: text(65535).nullable(),
	localisation: text(255).nullable(),
	fullName: text(255).nullable(),
	birthday: birthday.nullable(),
	position: positions,
	foot: feet,
	license: text(255).nullable(),
	clubSize: z.number().int().min(1).max(2147483647).nullable(),
	clubPosition: text(255).nullable(),
});
export const ProfileIdSchema = z.strictObject({
	id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/),
});
export type Validated<T> = { valid: true; data: T } | { valid: false };
export function validate<T>(
	schema: z.ZodType<T>,
	value: unknown,
): Validated<T> {
	const parsed = schema.safeParse(value);
	return parsed.success ? { valid: true, data: parsed.data } : { valid: false };
}
export const validateOnboarding = (value: unknown) =>
	validate(OnboardingSchema, value);
export const validateEdit = (value: unknown) =>
	validate(EditProfileSchema, value);
export const validateProfileId = (value: unknown) =>
	validate(ProfileIdSchema, value);
export const validateEmpty = (value: unknown) =>
	validate(z.strictObject({}), value);
export type Onboarding = z.infer<typeof OnboardingSchema>;
export type ProfileEdit = z.infer<typeof EditProfileSchema>;
