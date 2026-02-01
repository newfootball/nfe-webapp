"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "@/src/lib/auth-client";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = useTranslations("auth-layout");
	const { data: session } = useSession();

	if (session) {
		redirect("/");
	}

	return (
		<div className="flex flex-col">
			<main className="flex-1">{children}</main>
			<footer className="py-6 text-center text-sm text-muted-foreground mt-10">
				<div className="space-x-4">
					<Link href="/privacy" className="hover:text-foreground">
						{t("privacy")}
					</Link>
					<Link href="/terms" className="hover:text-foreground">
						{t("terms")}
					</Link>
					<Link href="/about-us" className="hover:text-foreground">
						{t("about-us")}
					</Link>
				</div>
			</footer>
		</div>
	);
}
