"use server";

import { auth } from "@/lib/auth";
import { comparePassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

const getUserLogin = async (email: string, password: string) => {
	try {
		const user = await prisma.user.findFirst({
			where: {
				OR: [{ email }, { name: email }],
			},
		});

		if (!user) {
			return null;
		}

		const isPasswordValid = await comparePassword(
			password,
			user?.password ?? "",
		);

		if (!isPasswordValid) {
			return null;
		}

		// Ne pas renvoyer le mot de passe
		const { password: _, ...userWithoutPassword } = user;
		return userWithoutPassword;
	} catch (error) {
		console.error("Error fetching user:", error);
		return null;
	}
};

const getUserSession = async (): Promise<User | null> => {
	const session = await auth();

	if (!session?.user) {
		return null;
	}

	const user = await prisma.user.findUnique({
		where: {
			id: session.user.id,
		},
	});

	if (!user) {
		return null;
	}

	return user;
};

export { getUserLogin, getUserSession };
