"use client";

import { useSession } from "@/src/lib/auth-client";
import { redirect } from "next/navigation";
import { toast } from "sonner";

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
