"use client";

import { useSession } from "next-auth/react";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session } = useSession();

	if (!session?.user) {
		console.log({ session });
	}

	return <>{children}</>;
}
