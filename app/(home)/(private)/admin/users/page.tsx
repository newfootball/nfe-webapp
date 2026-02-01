import { useTranslations } from "next-intl";
import { Layout } from "@/components/layouts/layout";
import UsersList from "./_components/users-list";

export default function UsersAdminPage() {
	const t = useTranslations("admin.users");

	return (
		<Layout>
			<div className="flex flex-col gap-4">
				<h1 className="text-2xl font-bold">{t("title")}</h1>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>
			<UsersList />
		</Layout>
	);
}
