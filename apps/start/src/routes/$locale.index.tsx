import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FeaturedHero } from "../components/home/featured-hero";
import { FeedStream } from "../components/home/feed-stream";
import { LockerRow } from "../components/home/locker-row";
import { JoinPanel, WeekPanel } from "../components/home/week-panel";
import { feedOptions } from "../lib/feed";
import { homeOptions } from "../lib/home";
import type { HomeData } from "../lib/home-contract";
import { readerOptions } from "../lib/reader";
export const Route = createFileRoute("/$locale/")({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(readerOptions),
			// Home sections are optional: a failure falls back to the signed-out page plus the feed.
			context.queryClient.prefetchQuery(homeOptions(context.locale)),
			// A backend failure remains a Query error with retry; the foundation is still fixture-free.
			context.queryClient.prefetchInfiniteQuery(feedOptions(context.locale)),
		]);
	},
	headers: () => ({ "Cache-Control": "private, no-store" }),
	component: Home,
});
const EMPTY: HomeData = {
	signedIn: false,
	week: null,
	featured: null,
	locker: [],
	canPin: false,
};
function Home() {
	const { locale } = Route.useRouteContext();
	const reader = useSuspenseQuery(readerOptions).data;
	const home = useQuery(homeOptions(locale));
	const feedAt = useQueryClient().getQueryState(
		feedOptions(locale).queryKey,
	)?.dataUpdatedAt;
	// Server and client share the fetch time, so relative ages hydrate identically.
	const now = home.dataUpdatedAt || feedAt || 0;
	const { signedIn, week, featured, locker, canPin } = home.data ?? EMPTY;
	return (
		<div className="rise -mx-6 flex flex-col gap-2 sm:mx-auto sm:max-w-xl">
			{!signedIn && <JoinPanel locale={locale} reader={reader} />}
			{week && <WeekPanel week={week} locale={locale} />}
			{featured && (
				<div className="mt-5">
					<FeaturedHero featured={featured} locale={locale} canPin={canPin} />
				</div>
			)}
			{signedIn && <LockerRow posts={locker} locale={locale} now={now} />}
			<FeedStream locale={locale} now={now} canPin={canPin} />
		</div>
	);
}
