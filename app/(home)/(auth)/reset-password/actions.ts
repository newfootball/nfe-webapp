"use server";

import { hashPassword } from "@/src/lib/password";
import { prisma } from "@/src/lib/prisma";
import { z } from "zod";

const resetSchema = z.object({
	token: z.string().min(1, { message: "Token is required" }),
	password: z
		.string()
		.min(8, { message: "Password must be at least 8 characters" }),
});

export async function resetPassword(token: string, password: string) {
	try {
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
				error: "Invalid or expired reset token",
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
			message:
				"Your password has been reset successfully. Redirecting to login...",
		};
	} catch (error) {
		console.error("Password reset error:", error);
		return {
			success: false,
			error: "An error occurred while resetting your password",
		};
	}
}
