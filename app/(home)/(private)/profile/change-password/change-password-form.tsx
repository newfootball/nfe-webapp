"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Password } from "@/components/ui/password";
import { authClient } from "@/src/lib/auth-client";

const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1),
		password: z.string().min(8),
		confirmPassword: z.string().min(8),
	})
	.refine((data) => data.password === data.confirmPassword, {
		path: ["confirmPassword"],
	});

export const ChangePasswordForm = () => {
	const t = useTranslations("profile.change-password");
	const [currentPassword, setCurrentPassword] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);

		const result = changePasswordSchema.safeParse({
			currentPassword,
			password,
			confirmPassword,
		});

		if (!result.success) {
			const issue = result.error.issues[0];
			if (issue?.path[0] === "currentPassword")
				setError(t("current-password-required"));
			else if (issue?.path[0] === "password") setError(t("password-too-short"));
			else if (issue?.path[0] === "confirmPassword")
				setError(t("passwords-do-not-match"));
			else setError(t("error-on-change-password"));
			return;
		}

		setIsLoading(true);
		const { error: authError } = await authClient.changePassword({
			currentPassword: result.data.currentPassword,
			newPassword: result.data.password,
			revokeOtherSessions: true,
		});

		setIsLoading(false);

		if (authError) {
			setError(authError.message ?? t("error-on-change-password"));
			return;
		}

		toast.success(t("password-changed-successfully"));
		setCurrentPassword("");
		setPassword("");
		setConfirmPassword("");
	};

	return (
		<form onSubmit={handleSubmit}>
			<div className="grid w-full max-w-sm items-center gap-2">
				{error && <p className="text-sm text-destructive">{error}</p>}
				<Password
					label={t("current-password")}
					id="currentPassword"
					name="currentPassword"
					value={currentPassword}
					onChange={(e) => setCurrentPassword(e.target.value)}
				/>
				<Password
					label={t("new-password")}
					id="password"
					name="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<Password
					label={t("confirm-new-password")}
					id="confirmPassword"
					name="confirmPassword"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
				/>
			</div>
			<Button className="w-full mt-4" type="submit" disabled={isLoading}>
				{t("change-password")}
			</Button>
			<div className="flex justify-center mt-4">
				<Link href="/profile">{t("back-to-profile")}</Link>
			</div>
		</form>
	);
};
