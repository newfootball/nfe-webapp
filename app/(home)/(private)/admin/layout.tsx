"use server";

import { redirect } from "next/navigation";
import { toast } from "sonner";

import { type SessionUser, auth } from "@/src/lib/auth";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	const user = session?.user as SessionUser;

	if (!user.role || user.role !== "ADMIN") {
		toast.error("You must be an admin to access this page.");
		redirect("/");
	}

	return <>{children}</>;
}
