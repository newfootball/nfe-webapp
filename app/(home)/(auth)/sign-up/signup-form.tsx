"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Password } from "@/components/ui/password";
import { signUp } from "@/src/lib/auth-client";

export function SignUpForm() {
	const t = useTranslations("sign-up");
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	// Créer le schéma avec les traductions
	const signUpSchema = z.object({
		email: z.string().email({ message: t("invalid-email") }),
		password: z.string().min(8, { message: t("password-too-short") }),
		confirmPassword: z.string().min(8, {
			message: t("confirm-password-too-short"),
		}),
	});

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);
		const result = signUpSchema.safeParse({ email, password, confirmPassword });

		if (!result.success) {
			setError(result.error.errors.map((error) => error.message).join("\n"));
			setIsLoading(false);
			return;
		}

		if (password !== confirmPassword) {
			setError(t("passwords-do-not-match"));
			setIsLoading(false);
			return;
		}

		try {
			const { data, error } = await signUp.email({
				email,
				password,
				name: email?.split("@")[0] || "User", // Use email prefix as default name
			});

			if (error) {
				setError(error.message ?? t("an-error-occurred"));
				return;
			}

			if (data) {
				router.push("/");
			}
		} catch (error) {
			console.error({ error });
			setError(t("an-error-occurred"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			{error && (
				<Alert
					variant="destructive"
					className="text-red-500 mb-2 text-center border border-red-500 pb-2"
				>
					{error}
				</Alert>
			)}
			<div className="grid gap-2 my-2">
				<Label htmlFor="email">{t("email")}</Label>
				<Input
					id="email"
					type="email"
					value={email}
					autoComplete="email"
					onChange={(e) => setEmail(e.target.value)}
					placeholder="m@example.com"
					required
				/>
			</div>
			<Password
				label={t("password")}
				id="password"
				name="password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				required
			/>
			<Password
				label={t("confirm-password")}
				id="confirmPassword"
				name="confirmPassword"
				value={confirmPassword}
				onChange={(e) => setConfirmPassword(e.target.value)}
				required
			/>
			<Button type="submit" className="w-full mt-2" disabled={isLoading}>
				{isLoading ? (
					<LoaderCircle className="w-4 h-4 animate-spin" />
				) : (
					t("create-account")
				)}
			</Button>
		</form>
	);
}
