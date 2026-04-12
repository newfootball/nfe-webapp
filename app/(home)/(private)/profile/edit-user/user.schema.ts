import { Foot, Position } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

export const createUserSchema = async () => {
	const t = await getTranslations("profile.edit-user");

	return z.object({
		email: z.string().email({ message: t("invalid-email") }),
		fullName: z.string().min(1, { message: t("full-name-required") }),
		biography: z.string().optional().nullable(),
		birthday: z.date().optional().nullable(),
		localisation: z.string().optional().nullable(),
		position: z.array(z.nativeEnum(Position)).optional().default([]),
		foot: z.array(z.nativeEnum(Foot)).optional().default([]),
	});
};

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
