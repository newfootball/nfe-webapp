"use client";

import { PageHeader } from "@/components/feature/page-header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { UserForm } from "./user-form";

export default function EditUserPage() {
	const { data: session } = useSession();

	if (!session?.user?.id || session?.user?.id === null) {
		toast.error("User not found");
		redirect("/profile");
	}

	return (
		<>
			<PageHeader title="Edit Profile" backLink="/profile" />
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardDescription>
						Enter your email below to edit your profile
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
		</>
	);
}
