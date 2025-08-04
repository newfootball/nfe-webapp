"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
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
