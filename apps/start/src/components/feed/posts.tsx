import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Button } from "../../../../../components/ui/button";
import { feedOptions } from "../../lib/feed";
import type { PublicPost } from "../../lib/feed-contract";
import { feedMessages } from "../../lib/feed-messages";
import { mediaMessages } from "../../lib/media-messages";
import type { Locale } from "../../lib/messages";
import { MediaPlayer } from "../media/media-player";
export function PostCard({
	post,
	locale,
}: {
	post: PublicPost;
	locale: Locale;
}) {
	const t = feedMessages[locale];
	return (
		<article className="rounded-xl border p-6" data-post-id={post.id}>
			<Link
				to="/$locale/user/$id"
				params={{ locale, id: post.author.id }}
				className="text-sm underline"
			>
				{post.author.name ?? t.profile}
			</Link>
			<h2 className="mt-3 text-xl font-bold">
				<Link to="/$locale/post/$id" params={{ locale, id: post.id }}>
					{post.title}
				</Link>
			</h2>
			<p className="my-4 whitespace-pre-wrap break-words">{post.description}</p>
			<MediaPlayer postId={post.id} locale={locale} title={post.title} />
			<p className="mt-3 text-sm">
				{t.likes}: {post._count.likes} · {t.comments}: {post._count.comments}
			</p>
		</article>
	);
}
export function FeedPending({ locale }: { locale: Locale }) {
	return (
		<p role="status" className="animate-pulse p-6">
			{feedMessages[locale].loading}
		</p>
	);
}
export function Posts({
	locale,
	authorId,
}: {
	locale: Locale;
	authorId?: string;
}) {
	const t = feedMessages[locale],
		query = useInfiniteQuery(feedOptions(locale, { authorId }));
	const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];
	return (
		<section aria-label={t.posts} className="mt-8 space-y-5">
			<Button asChild variant="outline">
				<Link to="/$locale/publish" params={{ locale }}>
					{mediaMessages[locale].publish}
				</Link>
			</Button>
			{query.isPending && <FeedPending locale={locale} />}
			{posts.map((post) => (
				<PostCard key={post.id} post={post} locale={locale} />
			))}
			{query.isError && (
				<div role="alert">
					<p>{t.error}</p>
					<Button
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
					disabled={query.isFetchingNextPage}
					onClick={() => query.fetchNextPage()}
				>
					{query.isFetchingNextPage ? t.loading : t.more}
				</Button>
			)}
			{!query.isPending &&
				!query.isError &&
				posts.length > 0 &&
				!query.hasNextPage && <p role="status">{t.end}</p>}
		</section>
	);
}

function useActiveLocale(): Locale {
	return useRouterState({
		select: (s) => (s.location.pathname.startsWith("/en") ? "en" : "fr"),
	});
}
export function FeedRoutePending() {
	const locale = useActiveLocale();
	return <FeedPending locale={locale} />;
}
export function FeedRouteError() {
	const locale = useActiveLocale(),
		router = useRouter(),
		t = feedMessages[locale];
	return (
		<section role="alert" className="space-y-4">
			<h1>{t.error}</h1>
			<Button onClick={() => router.invalidate()}>{t.retry}</Button>
		</section>
	);
}
