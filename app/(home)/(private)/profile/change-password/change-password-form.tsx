"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Password } from "@/components/ui/password";

export const ChangePasswordForm = () => {
	const t = useTranslations("profile.change-password");
	const [currentPassword, setCurrentPassword] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const changePasswordSchema = z
		.object({
			currentPassword: z
				.string()
				.min(1, { message: t("current-password-required") }),
			password: z.string().min(8, { message: t("password-too-short") }),
			confirmPassword: z
				.string()
				.min(8, { message: t("confirm-password-too-short") }),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t("passwords-do-not-match"),
			path: ["confirmPassword"],
		});

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);

		const result = changePasswordSchema.safeParse({
			currentPassword,
			password,
			confirmPassword,
		});

		if (!result.success) {
			setError(
				result.error.errors[0]?.message ?? t("error-on-change-password"),
			);
			return;
		}

		setIsLoading(true);
		try {
			// TODO: call change password server action
			toast.success(t("password-changed-successfully"));
		} catch {
			setError(t("error-on-change-password"));
		} finally {
			setIsLoading(false);
		}
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
