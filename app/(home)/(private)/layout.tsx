"use client";

import type { SessionUser } from "@/lib/auth";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { toast } from "sonner";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session } = useSession();
	const user = session?.user as SessionUser;

	if (!user) {
		toast.error("You must be signed in to access this page.");
		redirect("/sign-in");
	}

	return <>{children}</>;
}
