"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Password } from "@/components/ui/password";
import { LoaderCircle } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { saveUser } from "./save-user.actions";

const signUpSchema = z.object({
	email: z.string().email({ message: "Invalid email address" }),
	password: z
		.string()
		.min(8, { message: "Password must be at least 8 characters" }),
	confirmPassword: z
		.string()
		.min(8, { message: "Password confirmation must be at least 8 characters" }),
});

export function SignUpForm() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

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
			setError("Passwords do not match");
			setIsLoading(false);
			return;
		}

		saveUser({ email, password })
			.then((user) => {
				signIn("credentials", {
					email,
					password,
					redirect: false,
				});
			})
			.catch((error) => {
				setError(error.message);
			})
			.finally(() => {
				setIsLoading(false);
			});
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
				<Label htmlFor="email">Email</Label>
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
				label="Password"
				id="password"
				name="password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				required
			/>
			<Password
				label="Confirm password"
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
					"Create account"
				)}
			</Button>
		</form>
	);
}
