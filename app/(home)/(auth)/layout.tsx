"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { redirect } from "next/navigation";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = useTranslations("auth-layout");
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
						{t("privacy")}
					</a>
					<a href="/terms" className="hover:text-foreground">
						{t("terms")}
					</a>
					<a href="/about-us" className="hover:text-foreground">
						{t("about-us")}
					</a>
				</div>
			</footer>
		</div>
	);
}
