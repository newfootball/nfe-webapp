"use server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const signUpSchema = z.object({
	email: z.string().email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignUpFormData = z.infer<typeof signUpSchema>;

export const saveUser = async (data: SignUpFormData) => {
	const validatedData = signUpSchema.parse(data);

	const exists = await prisma.user.findUnique({
		where: {
			email: validatedData.email,
		},
	});

	if (exists) {
		throw new Error("User already exists");
	}

	// Hacher le mot de passe
	const hashedPassword = await hashPassword(validatedData.password);

	// Créer l'utilisateur
	const user = await prisma.user.create({
		data: {
			email: validatedData.email,
			password: hashedPassword,
		},
	});

	// Ne pas renvoyer le mot de passe
	const userWithoutPassword = { ...user, password: undefined };

	return userWithoutPassword;
};
