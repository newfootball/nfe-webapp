import { createFileRoute, notFound } from "@tanstack/react-router";
import { FeedNav } from "../components/feed/nav";
import { Posts } from "../components/feed/posts";
import { ProfileView } from "../components/profile/profile-view";
import { feedOptions } from "../lib/feed";
import { getPublicProfile } from "../lib/profile";
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
		return r.value;
	},
	staleTime: 0,
	component: Page,
});
function Page() {
	const profile = Route.useLoaderData();
	const { locale } = Route.useRouteContext();
	return (
		<>
			<FeedNav locale={locale} page="user" id={profile.id} />
			<ProfileView profile={profile} locale={locale} />
			<Posts locale={locale} authorId={profile.id} />
		</>
	);
}
