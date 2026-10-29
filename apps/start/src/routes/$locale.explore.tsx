import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "../../../../components/ui/button";
import { FeedNav } from "../components/feed/nav";
import {
	FeedPending,
	FeedRouteError,
	FeedRoutePending,
	PostCard,
} from "../components/feed/posts";
import { exploreOptions } from "../lib/feed";
import { SearchTextSchema } from "../lib/feed-input";
import { feedMessages } from "../lib/feed-messages";
export const ExploreSearchSchema = z.object({
	q: SearchTextSchema.catch("").default(""),
	tab: z.enum(["top", "users", "posts"]).catch("top").default("top"),
});
export const Route = createFileRoute("/$locale/explore")({
	validateSearch: (value) => ExploreSearchSchema.parse(value),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(exploreOptions(context.locale, deps)),
	headers: () => ({ "Cache-Control": "private, no-store" }),
	pendingComponent: FeedRoutePending,
	errorComponent: FeedRouteError,
	component: Page,
});
function Page() {
	const { locale } = Route.useRouteContext(),
		search = Route.useSearch(),
		navigate = Route.useNavigate();
	const t = feedMessages[locale],
		query = useQuery(exploreOptions(locale, search));
	const [text, setText] = useState(search.q);
	useEffect(() => {
		setText(search.q);
	}, [search.q]);
	useEffect(() => {
		const timer = setTimeout(() => {
			if (text.trim().normalize("NFC").toLocaleLowerCase("fr") !== search.q)
				void navigate({ search: { ...search, q: text }, replace: true });
		}, 400);
		return () => clearTimeout(timer);
	}, [text, search, navigate]);
	return (
		<>
			<FeedNav locale={locale} page="explore" q={search.q} tab={search.tab} />
			<h1 className="text-3xl font-bold">{t.explore}</h1>
			<label className="my-6 block">
				{t.search}
				<input
					type="search"
					maxLength={128}
					value={text}
					onChange={(e) => setText(e.target.value)}
					className="ml-3 rounded border bg-background p-2"
				/>
			</label>
			<nav aria-label={t.explore} className="mb-6 flex gap-6">
				{(["top", "users", "posts"] as const).map((tab) => (
					<Link
						key={tab}
						to="/$locale/explore"
						params={{ locale }}
						search={{ q: search.q, tab }}
						aria-current={search.tab === tab ? "page" : undefined}
					>
						{t[tab]}
					</Link>
				))}
			</nav>
			{query.isPending && <FeedPending locale={locale} />}
			{query.isError && (
				<div role="alert">
					<p>{t.error}</p>
					<Button onClick={() => query.refetch()}>{t.retry}</Button>
				</div>
			)}
			{query.data && (
				<div className="space-y-5">
					{query.data.users.map((user) => (
						<article key={user.id} className="rounded border p-4">
							<Link to="/$locale/user/$id" params={{ locale, id: user.id }}>
								{user.name ?? t.profile}
							</Link>
							<p>
								{t.posts}: {user._count.posts} · {user._count.followeds}
							</p>
						</article>
					))}
					{query.data.posts.map((post) => (
						<PostCard key={post.id} post={post} locale={locale} />
					))}
					{!query.data.users.length && !query.data.posts.length && (
						<p>{t.empty}</p>
					)}
				</div>
			)}
		</>
	);
}
