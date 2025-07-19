"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Password } from "@/components/ui/password";
import { LoaderCircle } from "lucide-react";
import { CredentialsSignin } from "next-auth";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

export function SignInForm() {
	const t = useTranslations("sign-in");
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [password, setPassword] = useState("");
	const [email, setEmail] = useState("");

	// Créer le schéma avec les traductions
	const schema = z.object({
		email: z.string().email({ message: t("invalid-email") }),
		password: z.string().min(8, { message: t("password-too-short") }),
	});

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);

		const result = schema.safeParse({ email, password });
		if (!result.success) {
			setError(result.error.errors.map((error) => error.message).join("\n"));
			setIsLoading(false);
			return;
		}

		try {
			const res = await signIn("credentials", {
				email,
				password,
				redirect: false,
			});

			if (res?.error) {
				setError(res?.code ?? t("invalid-credentials"));
				return;
			}

			return router.push("/");
		} catch (error) {
			console.error({ error });
			setError(
				error instanceof CredentialsSignin
					? error.message
					: t("an-error-occurred"),
			);
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
			<div className="grid gap-2 my-2">
				<Label htmlFor="email">{t("email")}</Label>
				<Input
					id="email"
					type="email"
					placeholder="m@example.com"
					required
					value={email}
					autoComplete="email"
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<Password
				id="password"
				required
				label={t("password")}
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			<div className="text-center">
				<Link
					href="/forgot-password"
					className="ml-auto inline-block text-sm underline"
				>
					{t("forgot-your-password")}
				</Link>
			</div>
			<Button type="submit" className="w-full mt-2" disabled={isLoading}>
				{isLoading ? (
					<LoaderCircle className="w-4 h-4 animate-spin" />
				) : (
					t("login")
				)}
			</Button>
		</form>
	);
}
