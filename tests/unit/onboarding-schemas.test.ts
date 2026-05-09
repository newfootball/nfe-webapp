import { describe, expect, it } from "bun:test";
import {
	clubInfoSchema,
	playerInfoSchema,
	userTypeSchema,
} from "@/src/lib/onboarding.schemas";

describe("onboarding schemas", () => {
	it("accepts every user type supported by Prisma", () => {
		for (const userType of ["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"]) {
			expect(userTypeSchema.safeParse({ userType }).success).toBe(true);
		}
	});

	it("rejects the old TRAINER role value", () => {
		expect(userTypeSchema.safeParse({ userType: "TRAINER" }).success).toBe(
			false,
		);
	});

	it("accepts both-footed players and optional licenses", () => {
		expect(
			playerInfoSchema.safeParse({
				birthDate: new Date("2000-01-01"),
				city: "Paris",
				position: "STRIKER",
				foot: "BOTH",
			}).success,
		).toBe(true);
	});

	it("requires a positive club size", () => {
		expect(
			clubInfoSchema.safeParse({
				birthDate: new Date("2000-01-01"),
				city: "Paris",
				clubName: "NFE Club",
				clubSize: 0,
				clubPosition: "President",
			}).success,
		).toBe(false);
	});
});
