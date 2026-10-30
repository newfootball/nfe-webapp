import { createFileRoute } from "@tanstack/react-router";
import { FeedNav } from "../components/feed/nav";
import {
	FeedRouteError,
	FeedRoutePending,
	Posts,
} from "../components/feed/posts";
import { feedOptions } from "../lib/feed";
import { feedMessages } from "../lib/feed-messages";
export const Route = createFileRoute("/$locale/feed")({
	loader: ({ context }) =>
		context.queryClient.ensureInfiniteQueryData(feedOptions(context.locale)),
	headers: () => ({ "Cache-Control": "private, no-store" }),
	pendingComponent: FeedRoutePending,
	errorComponent: FeedRouteError,
	component: Page,
});
function Page() {
	const { locale } = Route.useRouteContext();
	return (
		<>
			<FeedNav locale={locale} page="feed" />
			<h1 className="text-3xl font-bold">{feedMessages[locale].feed}</h1>
			<Posts locale={locale} />
		</>
	);
}
