"use server";

import { env } from "@/src/lib/env";
import { Resend } from "resend";

let resendInstance: Resend | null = null;

export const getResend = async (): Promise<Resend> => {
	if (!resendInstance) {
		if (!env.RESEND_API_KEY) {
			throw new Error("RESEND_API_KEY is not defined in environment variables");
		}
		resendInstance = new Resend(env.RESEND_API_KEY);
	}
	return resendInstance;
};

export const sendPasswordResetEmail = async (
	email: string,
	resetToken: string,
) => {
	const resend = await getResend();
	const resetUrl = `${
		process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
	}/reset-password?token=${resetToken}`;

	try {
		const { data, error } = await resend.emails.send({
			from: "NFE <noreply@newfootball.pro>",
			to: email,
			subject: "Reset your password",
			html: `
        <div>
          <h1>Reset Your Password</h1>
          <p>You requested a password reset for your NFE account.</p>
          <p>Click the link below to reset your password. This link will expire in 1 hour.</p>
          <a href="${resetUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Reset Password</a>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
		});

		if (error) {
			console.error("Error sending reset email:", error);
			throw new Error(`Failed to send reset email: ${error.message}`);
		}

		return { success: true, data };
	} catch (error) {
		console.error("Error sending reset email:", error);
		throw error;
	}
};
