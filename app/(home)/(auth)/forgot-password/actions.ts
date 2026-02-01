"use server";

import { randomBytes } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { sendPasswordResetEmail } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";

export async function requestPasswordReset(email: string): Promise<{
	success: boolean;
	message?: string;
	error?: string;
}> {
	const t = await getTranslations("forgot-password");

	try {
		const requestSchema = z.object({
			email: z.string().email({ message: t("invalid-email") }),
		});

		const result = requestSchema.safeParse({ email });

		if (!result.success) {
			return {
				success: false,
				error: result.error.errors.map((e) => e.message).join(", "),
			};
		}

		// Check if user exists
		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			// Don't reveal that the user doesn't exist for security reasons
			return {
				success: true,
				message: t("reset-instructions-sent"),
			};
		}

		// Generate a reset token
		const resetToken = randomBytes(32).toString("hex");
		const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

		// Save the reset token to the user
		await prisma.user.update({
			where: { id: user.id },
			data: {
				resetToken,
				resetTokenExpiry,
			},
		});

		// Send the reset email
		await sendPasswordResetEmail(email, resetToken);

		return {
			success: true,
			message: t("reset-instructions-sent"),
		};
	} catch (error) {
		console.error("Password reset request error:", error);
		return {
			success: false,
			error: t("error-processing-request"),
		};
	}
}
