import { createFileRoute, notFound } from "@tanstack/react-router";
import { FeedNav } from "../components/feed/nav";
import { Posts } from "../components/feed/posts";
import { ProfileView } from "../components/profile/profile-view";
import { feedOptions } from "../lib/feed";
import { getPublicProfile } from "../lib/profile";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/$locale/user/$id")({
	loader: async ({ params, context }) => {
		const r = await getPublicProfile({ data: { id: params.id } });
		if (!r.ok) {
			if (r.error === "invalid") throw notFound();
			throw new Error("Profile unavailable");
		}
		if (!r.value) throw notFound();
		await context.queryClient.ensureInfiniteQueryData(
			feedOptions(context.locale, { authorId: params.id }),
		);
		return { profile: r.value, seo: await getPublicPageContext() };
	},
	head: ({ loaderData, params }) =>
		loaderData
			? publicHead(
					loaderData.seo.origin,
					`/${params.locale}/user/${encodeURIComponent(params.id)}`,
					params.locale === "en" ? "en" : "fr",
					loaderData.profile.name ?? "NFE",
					loaderData.profile.biography ?? "Next Football Experience",
				)
			: {},
	staleTime: 0,
	component: Page,
});
function Page() {
	const { profile } = Route.useLoaderData();
	const { locale } = Route.useRouteContext();
	return (
		<>
			<FeedNav locale={locale} page="user" id={profile.id} />
			<ProfileView profile={profile} locale={locale} />
			<Posts locale={locale} authorId={profile.id} />
		</>
	);
}
