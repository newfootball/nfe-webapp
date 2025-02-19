"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = useSession();

	if (session.status === "authenticated") {
		redirect("/");
	}

	return (
		<div className="flex flex-col">
			<main className="flex-1">{children}</main>
			<footer className="py-6 text-center text-sm text-muted-foreground mt-10">
				<div className="space-x-4">
					<a href="/privacy" className="hover:text-foreground">
						Privacy
					</a>
					<a href="/terms" className="hover:text-foreground">
						Terms
					</a>
					<a href="/about-us" className="hover:text-foreground">
						About Us
					</a>
				</div>
			</footer>
		</div>
	);
}
