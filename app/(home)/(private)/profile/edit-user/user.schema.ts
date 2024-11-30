import { z } from "zod";

export const userSchema = z.object({
	email: z.string().email(),
	fullName: z.string(),
	biography: z.string().optional().nullable(),
	birthday: z.date().optional().nullable(),
});

export type UserDataForm = z.infer<typeof userSchema>;
