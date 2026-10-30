import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "../../../../components/ui/button";
import { PostCard } from "../components/feed/posts";
import { getSession } from "../lib/auth";
import { favoritesOptions } from "../lib/interactions";
import { interactionMessages } from "../lib/interactions-messages";
export const Route = createFileRoute("/$locale/profile_/favorites")({
	beforeLoad: async ({ params }) => {
		const r = await getSession();
		if (!r.ok || !r.value)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/profile/favorites` },
			});
	},
	component: Page,
});
function Page() {
	const { locale } = Route.useRouteContext(),
		t = interactionMessages[locale],
		q = useInfiniteQuery(favoritesOptions()),
		posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
	return (
		<section className="space-y-5">
			<h1>{t.favorites}</h1>
			{q.isPending && <p role="status">{t.loading}</p>}
			{q.isError && (
				<p role="alert">
					{t.error}
					<Button onClick={() => q.refetch()}>{t.retry}</Button>
				</p>
			)}
			{!q.isPending && !q.isError && !posts.length && <p>{t.empty}</p>}
			{posts.map((post) => (
				<PostCard key={post.id} post={post} locale={locale} />
			))}
			{q.hasNextPage && (
				<Button
					disabled={q.isFetchingNextPage}
					onClick={() => q.fetchNextPage()}
				>
					{t.more}
				</Button>
			)}
		</section>
	);
}
