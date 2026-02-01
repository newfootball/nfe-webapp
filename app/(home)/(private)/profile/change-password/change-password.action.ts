"use server";

import type { User } from "@prisma/client";
import { z } from "zod";
import { comparePassword, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const changePasswordSchema = z.object({
	currentPassword: z.string(),
	password: z.string(),
});

export const changePassword = async ({
	data,
	userSession,
}: {
	data: z.infer<typeof changePasswordSchema>;
	userSession: User;
}) => {
	const validatedData = changePasswordSchema.parse(data);

	const user = await prisma.user.findUnique({
		where: {
			id: userSession.id,
		},
	});

	if (!user) {
		throw new Error("User not found");
	}

	const hashCurrentPassword = await hashPassword(validatedData.currentPassword);

	const isPasswordValid = await comparePassword(
		hashCurrentPassword,
		user.password ?? "",
	);

	if (!isPasswordValid) {
		throw new Error("Invalid current password");
	}

	const hashedPassword = await hashPassword(validatedData.password);

	await prisma.user.update({
		where: { id: user.id },
		data: { password: hashedPassword },
	});
};
