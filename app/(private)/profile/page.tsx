"use client";

import { Layout } from "@/components/layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import type { User } from "@prisma/client";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "./change-password-form";
import { UserForm } from "./user-form";

export default function ProfilePage() {
	const { data: session } = useSession();

	if (!session?.user) return redirect("/sign-in");

	console.log(session);
	return (
		<Layout>
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">Profile</CardTitle>
					<CardDescription>
						Enter your email below to create your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<UserForm user={session?.user as User} />
						<Divider text="" />
						<ChangePasswordForm user={session?.user as User} />
					</div>
				</CardContent>
			</Card>
		</Layout>
	);
}
