"use server";

import { auth } from "@/lib/auth";
import { comparePassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export const getUserLogin = async (email: string, password: string) => {
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

		const { password: _, ...userWithoutPassword } = user;
		console.log({ userWithoutPassword });

		return userWithoutPassword;
	} catch (error) {
		console.error("Error fetching user:", error);
		return null;
	}
};

/**
 * Returns the user ID of the authenticated user, or null if there is no authenticated user.
 */
export const getUserSessionId = async (): Promise<string | null> => {
	try {
		const session = await auth();
		return session?.user?.id ?? null;
	} catch (error) {
		console.error("Error getting user session:", error);
		return null;
	}
};

export const getUserSession = async (): Promise<User | null> => {
	const userId = await getUserSessionId();

	if (userId) return getUser(userId);

	return null;
};

export const getUser = async (userId: string): Promise<User | null> => {
	const user = await prisma.user.findUnique({
		where: {
			id: userId,
		},
	});

	if (!user) {
		return null;
	}

	return user;
};
