import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
	return (
		<div className="flex justify-center items-center pt-20">
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">Forgot Password</CardTitle>
					<CardDescription>
						Enter your email address and we&apos;ll send you instructions to
						reset your password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<ForgotPasswordForm />
					</div>

					<div className="mt-4 text-center text-sm">
						Remember your password?{" "}
						<Link href="/sign-in" className="underline">
							Sign in
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
