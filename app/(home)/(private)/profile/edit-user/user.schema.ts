import { z } from "zod";
import { Foot, Position } from "@/src/generated/prisma/enums";

export const userSchema = z.object({
	email: z.string().email(),
	fullName: z.string(),
	biography: z.string().optional().nullable(),
	birthday: z.date().optional().nullable(),
	localisation: z.string().optional().nullable(),
	position: z.array(z.nativeEnum(Position)).optional().default([]),
	foot: z.array(z.nativeEnum(Foot)).optional().default([]),
});

export type UserDataForm = z.infer<typeof userSchema>;
