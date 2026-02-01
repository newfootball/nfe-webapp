"use client";

import { redirect } from "next/navigation";
import { toast } from "sonner";
import { useSession } from "@/src/lib/auth-client";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session } = useSession();

	if (!session) {
		toast.error("You must be signed in to access this page.");
		redirect("/sign-in");
	}

	return <>{children}</>;
}
