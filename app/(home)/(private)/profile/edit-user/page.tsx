import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/feature/page-header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { getEditableProfile } from "@/src/query/profile.query";
import { UserForm } from "./user-form";

export default async function EditUserPage() {
	const t = await getTranslations("profile.edit-user");
	const user = await getEditableProfile();

	if (!user) {
		redirect("/profile");
	}

	return (
		<>
			<PageHeader title={t("edit-profile")} backLink="/profile" />
			<Card className="w-full shadow-none border-none">
				<CardHeader>
					<CardDescription>{t("enter-email-to-edit-profile")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<UserForm initialUser={user} />
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
