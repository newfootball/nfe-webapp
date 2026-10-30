import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "../../../../components/ui/button";
import { getSession } from "../lib/auth";
import { ownFollowsOptions } from "../lib/follow";
import { followMessages } from "../lib/follow-messages";

export const Route = createFileRoute("/$locale/profile_/follows")({
	validateSearch: (
		s: Record<string, unknown>,
	): { direction: "following" | "followers" } => ({
		direction: s.direction === "followers" ? "followers" : "following",
	}),
	beforeLoad: async ({ params }) => {
		const r = await getSession();
		if (!r.ok || !r.value)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/profile/follows` },
			});
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureInfiniteQueryData(
			ownFollowsOptions(deps.direction),
		),
	staleTime: 0,
	gcTime: 0,
	component: Page,
});
function Page() {
	const { locale } = Route.useRouteContext(),
		{ direction } = Route.useSearch();
	const t = followMessages[locale],
		query = useInfiniteQuery(ownFollowsOptions(direction));
	return (
		<section className="space-y-5">
			<h1 className="text-2xl font-bold">{t.lists}</h1>
			<nav className="flex gap-5">
				{(["following", "followers"] as const).map((d) => (
					<Link
						key={d}
						to="/$locale/profile/follows"
						params={{ locale }}
						search={{ direction: d }}
						aria-current={direction === d ? "page" : undefined}
					>
						{t[d]}
					</Link>
				))}
			</nav>
			{query.isPending && <p role="status">{t.loading}</p>}
			{query.isError && (
				<p role="alert">
					{t.error} <Button onClick={() => query.refetch()}>{t.retry}</Button>
				</p>
			)}
			<ul>
				{query.data?.pages
					.flatMap((p) => p.profiles)
					.map((p) => (
						<li key={p.id}>
							<Link to="/$locale/user/$id" params={{ locale, id: p.id }}>
								{p.name}
							</Link>
						</li>
					))}
			</ul>
			{query.data?.pages.every((p) => p.profiles.length === 0) && (
				<p>{t.empty}</p>
			)}
			{query.hasNextPage && (
				<Button
					disabled={query.isFetchingNextPage}
					onClick={() => query.fetchNextPage()}
				>
					{t.more}
				</Button>
			)}
		</section>
	);
}
