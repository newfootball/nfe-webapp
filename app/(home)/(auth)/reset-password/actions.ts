"use server";

import { hashPassword } from "@/src/lib/password";
import { prisma } from "@/src/lib/prisma";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

export async function resetPassword(token: string, password: string) {
	const t = await getTranslations("reset-password");

	try {
		const resetSchema = z.object({
			token: z.string().min(1, { message: t("token-required") }),
			password: z.string().min(8, { message: t("password-too-short") }),
		});

		const result = resetSchema.safeParse({ token, password });

		if (!result.success) {
			return {
				success: false,
				error: result.error.errors.map((e) => e.message).join(", "),
			};
		}

		// Find user with the reset token
		const user = await prisma.user.findFirst({
			where: {
				resetToken: token,
				resetTokenExpiry: {
					gt: new Date(),
				},
			},
		});

		if (!user) {
			return {
				success: false,
				error: t("invalid-or-expired-reset-token"),
			};
		}

		// Hash the new password
		const hashedPassword = await hashPassword(password);

		// Update the user's password and clear the reset token
		await prisma.user.update({
			where: { id: user.id },
			data: {
				password: hashedPassword,
				resetToken: null,
				resetTokenExpiry: null,
			},
		});

		return {
			success: true,
			message: t("password-reset-success-redirect"),
		};
	} catch (error) {
		console.error("Password reset error:", error);
		return {
			success: false,
			error: t("error-resetting-password"),
		};
	}
}
