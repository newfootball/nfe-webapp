import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Layout } from "@/components/layouts/layout";
import { getSession } from "@/src/lib/auth-server";
import { getFavoritesByUser } from "@/src/query/favorite.query";
import { FavoritesList } from "./favorites-list";

export default async function FavoritesPage() {
	const session = await getSession();

	if (!session?.user?.id) {
		redirect("/sign-in");
	}

	const t = await getTranslations("profile.favorites");
	const posts = await getFavoritesByUser(session.user.id);

	return (
		<Layout>
			<div className="py-4">
				<h1 className="text-xl font-bold mb-6">{t("title")}</h1>
				<FavoritesList posts={posts} emptyLabel={t("empty")} />
			</div>
		</Layout>
	);
}
