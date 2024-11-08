"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Password } from "@/components/ui/password";
import { LoaderCircle } from "lucide-react";
import { CredentialsSignin } from "next-auth";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

const schema = z.object({
	email: z.string().email({ message: "Invalid email address" }),
	password: z
		.string()
		.min(8, { message: "Password must be at least 8 characters" }),
});

export function SignInForm() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [password, setPassword] = useState("");
	const [email, setEmail] = useState("");

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

			console.info({ res });

			if (res?.error) {
				setError(res?.code ?? "Invalid credentials");
				return;
			}

			return router.push("/");
		} catch (error) {
			console.error({ error });
			setError(
				error instanceof CredentialsSignin
					? error.message
					: "Une erreur s'est produite",
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
				label="Password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			<div className="text-center">
				<Link href="#" className="ml-auto inline-block text-sm underline">
					Forgot your password?
				</Link>
			</div>
			<Button type="submit" className="w-full mt-2" disabled={isLoading}>
				{isLoading ? (
					<LoaderCircle className="w-4 h-4 animate-spin" />
				) : (
					"Login"
				)}
			</Button>
		</form>
	);
}
