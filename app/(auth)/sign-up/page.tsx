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
import { SignUpForm } from "./signup-form";

export default function SignUpPage() {
	return (
		<div className="flex justify-center items-center pt-20">
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">Create account</CardTitle>
					<CardDescription>
						Enter your email below to create your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<SignUpForm />

						<Divider text="Or continue with" />

						<GoogleButton />
					</div>

					<div className="mt-4 text-center text-sm">
						Already have an account?{" "}
						<Link href="/sign-in" className="underline">
							Sign in
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
