import { GoogleButton } from "@/components/auth/google-button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import Link from "next/link";
import { SignInForm } from "./signin-form";

export default function SignInPage() {
	return (
		<div className="flex justify-center items-center pt-20">
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">Sign in</CardTitle>
					<CardDescription>
						Enter your email below to sign in to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<SignInForm />

						<Divider text="Or continue with" />

						<GoogleButton />
					</div>

					<div className="mt-4 text-center text-sm">
						Don&apos;t have an account?{" "}
						<Link href="/sign-up" className="underline">
							Sign up
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
