"use client";

import { PageHeader } from "@/components/feature/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { useSession } from "@/src/lib/auth-client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { UserForm } from "./user-form";

export default function EditUserPage() {
  const t = useTranslations("profile.edit-user");
  const { data: session } = useSession();

  if (!session?.user?.id) {
    toast.error(t("user-not-found"));
    redirect("/profile");
  }

  return (
    <>
      <PageHeader title={t("edit-profile")} backLink="/profile" />
      <Card className="mx-auto max-w-sm shadow-none border-none">
        <CardHeader>
          <CardDescription>{t("enter-email-to-edit-profile")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <UserForm userId={session.user.id} />
            <Divider text="" />
            <div className="flex justify-center">
              <Link href="/profile/change-password">
                {t("change-password")}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
