"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
	const t = useTranslations("forgot-password");
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [email, setEmail] = useState("");

	// Créer le schéma avec les traductions
	const schema = z.object({
		email: z.string().email({ message: t("invalid-email") }),
	});

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);
		setSuccess(null);

		const result = schema.safeParse({ email });
		if (!result.success) {
			setError(result.error.errors.map((error) => error.message).join("\n"));
			setIsLoading(false);
			return;
		}

		try {
			// Call the server action to handle password reset
			const resetResponse = await requestPasswordReset(email);

			if (resetResponse.success) {
				setSuccess(resetResponse.message || t("reset-instructions-sent"));
				setEmail("");
			} else {
				setError(resetResponse.error || t("error-processing-request"));
			}
		} catch (error) {
			console.error({ error });
			setError(t("error-processing-request"));
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

			<Button type="submit" className="w-full mt-4" disabled={isLoading}>
				{isLoading ? (
					<LoaderCircle className="w-4 h-4 animate-spin" />
				) : (
					t("send-reset-instructions")
				)}
			</Button>
		</form>
	);
}
