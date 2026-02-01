"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "./actions";

function ResetPasswordFormContent() {
	const t = useTranslations("reset-password");
	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token");

	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	// Créer le schéma avec les traductions
	const schema = z
		.object({
			password: z.string().min(8, { message: t("password-too-short") }),
			confirmPassword: z.string(),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t("passwords-do-not-match"),
			path: ["confirmPassword"],
		});

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);
		setSuccess(null);

		if (!token) {
			setError(t("invalid-or-missing-reset-token"));
			setIsLoading(false);
			return;
		}

		const result = schema.safeParse({ password, confirmPassword });
		if (!result.success) {
			setError(result.error.errors.map((error) => error.message).join("\n"));
			setIsLoading(false);
			return;
		}

		try {
			const resetResponse = await resetPassword(token, password);

			if (resetResponse.success) {
				setSuccess(resetResponse.message ?? t("password-reset-success"));
				// Redirect to login page after 3 seconds
				setTimeout(() => {
					router.push("/login");
				}, 3000);
			} else {
				setError(resetResponse.error || t("error-resetting-password"));
			}
		} catch (error) {
			console.error({ error });
			setError(t("error-resetting-password"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			{error && (
				<Alert
					variant="destructive"
					className="text-red-500 text-center border border-red-500 pb-2 my-4"
				>
					{error}
				</Alert>
			)}

			{success && (
				<Alert className="text-green-500 text-center border border-green-500 pb-2 my-4">
					{success}
				</Alert>
			)}

			<div className="grid gap-2 my-2">
				<Label htmlFor="password">{t("new-password")}</Label>
				<Input
					id="password"
					type="password"
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
			</div>

			<div className="grid gap-2 my-2">
				<Label htmlFor="confirmPassword">{t("confirm-password")}</Label>
				<Input
					id="confirmPassword"
					type="password"
					required
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
				/>
			</div>

			<Button type="submit" className="w-full mt-4" disabled={isLoading}>
				{isLoading ? (
					<LoaderCircle className="w-4 h-4 animate-spin" />
				) : (
					t("reset-password")
				)}
			</Button>
		</form>
	);
}

export function ResetPasswordForm() {
	return (
		<Suspense fallback={<div className="text-center">Chargement...</div>}>
			<ResetPasswordFormContent />
		</Suspense>
	);
}
