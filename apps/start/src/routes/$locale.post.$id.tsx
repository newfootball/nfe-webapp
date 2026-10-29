import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { FeedNav } from "../components/feed/nav";
import {
	FeedRouteError,
	FeedRoutePending,
	PostCard,
} from "../components/feed/posts";
import { postOptions } from "../lib/feed";
export const Route = createFileRoute("/$locale/post/$id")({
	loader: async ({ params, context }) => {
		const p = await context.queryClient.ensureQueryData(
			postOptions(context.locale, params.id),
		);
		if (!p) throw notFound();
	},
	headers: () => ({ "Cache-Control": "private, no-store" }),
	pendingComponent: FeedRoutePending,
	errorComponent: FeedRouteError,
	component: Page,
});
function Page() {
	const { locale } = Route.useRouteContext(),
		{ id } = Route.useParams();
	const { data } = useSuspenseQuery(postOptions(locale, id));
	if (!data) throw notFound();
	return (
		<>
			<FeedNav locale={locale} page="post" id={id} />
			<PostCard post={data} locale={locale} />
		</>
	);
}
