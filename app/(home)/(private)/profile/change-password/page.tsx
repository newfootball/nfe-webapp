import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/feature/page-header";
import { Layout } from "@/components/layouts/layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/src/lib/auth-server";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
	const t = await getTranslations("profile.change-password");
	const session = await getSession();

	if (!session?.user?.id) {
		redirect("/sign-in");
	}

	const credentialAccount = await prisma.account.findFirst({
		where: { userId: session.user.id, providerId: "credential" },
		select: { id: true },
	});

	return (
		<>
			<PageHeader title={t("change-password")} backLink="/profile" />
			<Layout>
				<Card className="mx-auto max-w-sm shadow-none border-none">
					<CardHeader>
						<CardTitle className="text-2xl">{t("change-password")}</CardTitle>
						<CardDescription>
							{credentialAccount
								? t("enter-current-and-new-password")
								: t("no-password-google-account")}
						</CardDescription>
					</CardHeader>
					{credentialAccount && (
						<CardContent>
							<ChangePasswordForm />
						</CardContent>
					)}
				</Card>
			</Layout>
		</>
	);
}
