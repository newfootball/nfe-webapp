import { z } from "zod";

export const userTypeSchema = z.object({
	userType: z.enum(["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"] as const),
});

const baseInfoSchema = z.object({
	birthDate: z.date(),
	city: z.string().min(2),
});

export const playerInfoSchema = baseInfoSchema.extend({
	position: z.string().min(2),
	foot: z.enum(["LEFT", "RIGHT", "BOTH"]),
	license: z.string().optional(),
});

export const coachInfoSchema = baseInfoSchema.extend({
	clubName: z.string().min(2),
});

export const clubInfoSchema = baseInfoSchema.extend({
	clubName: z.string().min(2),
	clubSize: z.number().min(1),
	clubPosition: z.string().min(2),
});

export type UserTypeValues = z.infer<typeof userTypeSchema>;
export type PlayerInfoValues = z.infer<typeof playerInfoSchema>;
export type CoachInfoValues = z.infer<typeof coachInfoSchema>;
export type ClubInfoValues = z.infer<typeof clubInfoSchema>;
