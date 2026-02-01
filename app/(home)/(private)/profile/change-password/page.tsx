"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/feature/page-header";
import { Layout } from "@/components/layouts/layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
	const t = useTranslations("profile.change-password");

	return (
		<>
			<PageHeader title={t("change-password")} backLink="/profile" />
			<Layout>
				<Card className="mx-auto max-w-sm shadow-none border-none">
					<CardHeader>
						<CardTitle className="text-2xl">{t("change-password")}</CardTitle>
						<CardDescription>
							{t("enter-current-and-new-password")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChangePasswordForm />
					</CardContent>
				</Card>
			</Layout>
		</>
	);
}
