"use server";

import { sendPasswordResetEmail } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";
import { randomBytes } from "crypto";
import { z } from "zod";

const requestSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export async function requestPasswordReset(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
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
        message:
          "If your email is registered, you will receive reset instructions",
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
      message:
        "If your email is registered, you will receive reset instructions",
    };
  } catch (error) {
    console.error("Password reset request error:", error);
    return {
      success: false,
      error: "An error occurred while processing your request",
    };
  }
}
