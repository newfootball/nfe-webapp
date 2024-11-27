"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = useSession();

	console.log(session);

	if (session) {
		redirect("/");
	}

	return <>{children}</>;
}
