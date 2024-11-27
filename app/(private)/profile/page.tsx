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
import { useSession } from "next-auth/react";
import Link from "next/link";
import { UserForm } from "./user-form";

export default function ProfilePage() {
	const { data: session } = useSession();

	if (!session?.user?.id) {
		throw new Error("User not found");
	}

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
						<UserForm userId={session.user.id} />
						<Divider text="" />
						<div className="flex justify-center">
							<Link href="/profile/change-password">Change Password</Link>
						</div>
					</div>
				</CardContent>
			</Card>
		</Layout>
	);
}
