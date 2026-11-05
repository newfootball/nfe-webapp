import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { feedOptions } from "../../lib/feed";
import { feedMessages } from "../../lib/feed-messages";
import { homeMessages } from "../../lib/home-messages";
import type { Locale } from "../../lib/messages";
import { Button } from "../ui/button";
import { Icon } from "./icon";
import { SectionHead, sectionLink } from "./section-head";
import { StreamPost } from "./stream-post";

export function FeedStream({
	locale,
	now,
	canPin,
}: {
	locale: Locale;
	now: number;
	canPin: boolean;
}) {
	const t = feedMessages[locale],
		h = homeMessages[locale],
		query = useInfiniteQuery(feedOptions(locale));
	const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];
	return (
		<section aria-labelledby="feed-title">
			<SectionHead id="feed-title" title={h.feed}>
				<Link
					to="/$locale/publish"
					params={{ locale }}
					className={`${sectionLink} inline-flex items-center gap-1`}
				>
					<Icon name="plus" className="size-3.5" strokeWidth={1.5} />
					{h.publish}
				</Link>
			</SectionHead>
			{query.isPending && (
				<p
					role="status"
					className="animate-pulse border-t px-4 py-6 text-sm sm:px-0"
				>
					{t.loading}
				</p>
			)}
			{posts.map((post) => (
				<StreamPost
					key={post.id}
					post={post}
					locale={locale}
					now={now}
					canPin={canPin}
				/>
			))}
			<div className="flex flex-col items-start gap-3 border-t px-4 py-5 text-sm text-muted-foreground sm:px-0">
				{query.isError && (
					<div role="alert" className="flex items-center gap-3">
						{t.error}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								query.isFetchNextPageError
									? query.fetchNextPage()
									: query.refetch()
							}
						>
							{t.retry}
						</Button>
					</div>
				)}
				{!query.isPending && !query.isError && posts.length === 0 && (
					<p>{t.empty}</p>
				)}
				{query.hasNextPage && (
					<Button
						variant="outline"
						disabled={query.isFetchingNextPage}
						onClick={() => query.fetchNextPage()}
					>
						{query.isFetchingNextPage ? t.loading : t.more}
					</Button>
				)}
				{!query.isPending &&
					!query.isError &&
					posts.length > 0 &&
					!query.hasNextPage && (
						<p
							role="status"
							className="font-label text-[11.5px] tracking-[0.16em] uppercase"
						>
							{t.end}
						</p>
					)}
			</div>
		</section>
	);
}
