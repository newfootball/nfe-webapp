"use client";

import { Layout } from "@/components/layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
	return (
		<Layout>
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">Change Password</CardTitle>
					<CardDescription>
						Enter your current password and new password below
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChangePasswordForm />
				</CardContent>
			</Card>
		</Layout>
	);
}
