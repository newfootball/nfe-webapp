"use client";

import { redirect } from "next/navigation";
import { useSession } from "@/src/lib/auth-client";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session, isPending } = useSession();

	if (isPending) {
		return null;
	}

	if (!session) {
		redirect("/sign-in");
	}

	return <>{children}</>;
}
