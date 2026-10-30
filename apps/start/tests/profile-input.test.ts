import { describe, expect, test } from "bun:test";
import { publicProfile as schemaDTO } from "../../../tools/appwrite-schema/mapping.mts";
import { profileV2Definition } from "../../../tools/appwrite-schema/profile-v2-contract.mts";
import { enums, schemaDigest } from "../../../tools/appwrite-schema/schema.mts";
import { detectLocale } from "../src/lib/locale-policy";
import { POSITIONS, publicProfile } from "../src/lib/profile-contract";
import {
	EditProfileSchema,
	OnboardingSchema,
	validateEmpty,
} from "../src/lib/profile-input";

const common = { name: "Public name", city: "Paris", biography: "Hello" };
const player = {
	...common,
	userType: "PLAYER",
	birthDate: "2000-05-02",
	position: ["STRIKER"],
	foot: "BOTH",
	license: "Private license",
};
describe("strict onboarding contract", () => {
	test("all types and meaningful USER, club has no required birthday", () => {
		for (const data of [
			{ ...common, userType: "USER" },
			player,
			...["COACH", "RECRUITER"].map((userType) => ({
				...common,
				userType,
				birthDate: "2001-02-01",
				clubName: "Club",
			})),
			{
				...common,
				userType: "CLUB",
				clubName: "Club",
				clubSize: 12,
				clubPosition: "Director",
			},
		])
			expect(OnboardingSchema.safeParse(data).success).toBe(true);
	});
	test("eleven positions, legacy aliases, duplicate/unknown rejected", () => {
		expect(POSITIONS.join(",")).toBe(enums.Position.join(","));
		expect(
			OnboardingSchema.parse({
				...player,
				position: ["DEFENDER", "MIDFIELDER", "FORWARD"],
			}),
		).toMatchObject({
			position: ["CENTRE_BACK", "CENTRE_MIDFIELDER", "CENTRE_FORWARD"],
		});
		for (const position of POSITIONS)
			expect(
				OnboardingSchema.safeParse({ ...player, position: [position] }).success,
			).toBe(true);
		for (const position of [
			[],
			["STRIKER", "STRIKER"],
			["DEFENDER", "CENTRE_BACK"],
			["unknown"],
		])
			expect(OnboardingSchema.safeParse({ ...player, position }).success).toBe(
				false,
			);
	});
	test("malformed, future date, lengths and authority rejected", () => {
		for (const data of [
			null,
			[],
			{},
			{ ...player, birthDate: "2025-02-30" },
			{ ...player, birthDate: "2999-01-01" },
			{ ...player, name: "x".repeat(129) },
			...[
				"id",
				"userId",
				"role",
				"$permissions",
				"labels",
				"isOnboarded",
				"email",
				"prefs",
			].map((key) => ({ ...player, [key]: "ADMIN" })),
			{ ...player, userType: "ADMIN" },
		])
			expect(OnboardingSchema.safeParse(data).success).toBe(false);
		expect(validateEmpty({ userId: "other" })).toEqual({ valid: false });
	});
	test("edit disallows authority, email, account type and duplicate feet", () => {
		const valid = {
			name: "Unique",
			biography: null,
			localisation: null,
			fullName: null,
			birthday: null,
			position: [],
			foot: [],
			license: null,
			clubSize: null,
			clubPosition: null,
		};
		expect(EditProfileSchema.safeParse(valid).success).toBe(true);
		for (const key of [
			"id",
			"userId",
			"role",
			"userType",
			"isOnboarded",
			"email",
			"labels",
		])
			expect(
				EditProfileSchema.safeParse({ ...valid, [key]: "forged" }).success,
			).toBe(false);
		expect(
			EditProfileSchema.safeParse({ ...valid, foot: ["LEFT", "LEFT"] }).success,
		).toBe(false);
	});
	test("public allowlist exactly matches v1; club v2 stays private", () => {
		const row = {
			$id: "id",
			image: null,
			name: "public",
			email: "secret",
			birthday: "secret",
			fullName: "secret",
			role: "ADMIN",
			license: "secret",
			clubSize: 20,
			clubPosition: "secret",
		};
		expect(publicProfile(row)).toEqual(schemaDTO(row));
		expect(Object.keys(publicProfile(row))).toEqual([
			"id",
			"name",
			"image",
			"biography",
			"position",
			"foot",
			"localisation",
			"userType",
			"isOnboarded",
			"createdAt",
			"updatedAt",
		]);
		expect(Object.keys(profileV2Definition)).toEqual(["private_profiles"]);
		expect(schemaDigest.length).toBe(64);
	});
});
test("locale priority and weighted accepted language", () => {
	expect(detectLocale("fr", "en")).toBe("fr");
	expect(detectLocale("invalid", "de;q=1,en-GB;q=0.9,fr;q=0.7")).toBe("en");
	expect(detectLocale(null, "en;q=0,fr;q=0.1")).toBe("fr");
	expect(detectLocale(null, "en;q=NaN,es;q=1")).toBe("fr");
	expect(detectLocale(null, null)).toBe("fr");
});
