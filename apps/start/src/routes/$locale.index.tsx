import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FeedNav } from "../components/feed/nav";
import { Posts } from "../components/feed/posts";
import { feedOptions } from "../lib/feed";
import { messages } from "../lib/messages";
import { readerOptions } from "../lib/reader";
export const Route = createFileRoute("/$locale/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(readerOptions);
		// A backend failure remains a Query error with retry; the foundation is still fixture-free.
		await context.queryClient.prefetchInfiniteQuery(
			feedOptions(context.locale),
		);
	},
	headers: () => ({ "Cache-Control": "private, no-store" }),
	component: Home,
});
function Home() {
	const { locale } = Route.useRouteContext();
	const t = messages[locale];
	const { data } = useSuspenseQuery(readerOptions);
	return (
		<>
			<FeedNav locale={locale} page="home" />
			<h1 className="mb-6 text-5xl font-bold">{t.title}</h1>
			<p className="text-lg text-muted-foreground">{t.intro}</p>
			<p data-testid="reader" className="mt-6 text-sm">
				{data}
			</p>
			<Posts locale={locale} />
		</>
	);
}
