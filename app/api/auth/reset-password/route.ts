"use server";

import { randomBytes } from "node:crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
	email: z.string().email({ message: "Invalid email address" }),
});

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const result = requestSchema.safeParse(body);

		if (!result.success) {
			return NextResponse.json(
				{ error: result.error.errors.map((e) => e.message).join(", ") },
				{ status: 400 },
			);
		}

		const { email } = result.data;

		// Check if user exists
		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			// Don't reveal that the user doesn't exist for security reasons
			return NextResponse.json(
				{
					message:
						"If your email is registered, you will receive reset instructions",
				},
				{ status: 200 },
			);
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

		return NextResponse.json(
			{
				message:
					"If your email is registered, you will receive reset instructions",
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("Password reset request error:", error);
		return NextResponse.json(
			{ error: "An error occurred while processing your request" },
			{ status: 500 },
		);
	}
}
