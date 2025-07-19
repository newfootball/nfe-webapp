"use server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

const signUpSchema = z.object({
	email: z.string().email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});
const t = await getTranslations("sign-up");
export type SignUpFormData = z.infer<typeof signUpSchema>;

export const saveUser = async (data: SignUpFormData) => {
	const validatedData = signUpSchema.parse(data);

	const exists = await prisma.user.findUnique({
		where: {
			email: validatedData.email,
		},
	});

	if (exists) {
		throw new Error(t("user-already-exists"));
	}

	const hashedPassword = await hashPassword(validatedData.password);

	const user = await prisma.user.create({
		data: {
			email: validatedData.email,
			password: hashedPassword,
		},
	});

	const userWithoutPassword = { ...user, password: undefined };

	return userWithoutPassword;
};
