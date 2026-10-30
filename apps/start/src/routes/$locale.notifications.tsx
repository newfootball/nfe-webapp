import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "../../../../components/ui/button";
import { getSession } from "../lib/auth";
import { notificationOptions, setNotificationsRead } from "../lib/notification";
import type { NotificationMarkInput } from "../lib/notification-input";
import {
	notificationMessages,
	notificationText,
} from "../lib/notification-messages";

export const Route = createFileRoute("/$locale/notifications")({
	beforeLoad: async ({ params }) => {
		const r = await getSession();
		if (!r.ok || !r.value)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/notifications` },
			});
		return { notificationViewerId: r.value.id };
	},
	loader: ({ context }) =>
		context.queryClient.ensureInfiniteQueryData(
			notificationOptions(context.notificationViewerId),
		),
	staleTime: 0,
	gcTime: 0,
	component: Page,
});
function Page() {
	const { locale, notificationViewerId: viewerId } = Route.useRouteContext(),
		client = useQueryClient(),
		options = notificationOptions(viewerId),
		query = useInfiniteQuery(options),
		t = notificationMessages[locale];
	const change = useMutation({
		mutationFn: async (input: NotificationMarkInput) => {
			// Capture cache ownership, so a late A->B->A mutation cannot invalidate a new cache.
			const owner = client.getQueryCache().find({ queryKey: options.queryKey });
			for (;;) {
				if (
					client.getQueryCache().find({ queryKey: options.queryKey }) !== owner
				)
					return;
				const r = await setNotificationsRead({ data: input });
				if (!r.ok) throw new Error(r.error);
				if (!r.value.more) break;
			}
			if (client.getQueryCache().find({ queryKey: options.queryKey }) === owner)
				await client.invalidateQueries({ queryKey: options.queryKey });
		},
	});
	const items = query.data?.pages.flatMap((p) => p.notifications) ?? [],
		unread = query.data?.pages[0]?.unread ?? 0;
	return (
		<section className="space-y-5">
			<div className="flex flex-wrap items-center gap-4">
				<h1 className="text-2xl font-bold">{t.title}</h1>
				<span aria-live="polite" data-testid="notification-badge">
					{t.unread}: {unread}
				</span>
				{unread > 0 && (
					<Button
						disabled={change.isPending}
						onClick={() => change.mutate({ viewerId, mode: "all" })}
					>
						{t.all}
					</Button>
				)}
			</div>
			{query.isPending && <p role="status">{t.loading}</p>}
			{(query.isError || change.isError) && (
				<p role="alert">
					{t.error} <Button onClick={() => query.refetch()}>{t.retry}</Button>
				</p>
			)}
			{!query.isPending && items.length === 0 && <p>{t.empty}</p>}
			<ul className="space-y-3">
				{items.map((item) => (
					<li
						key={item.id}
						className="rounded-lg border p-4 space-y-2"
						data-testid="notification-item"
						data-type={item.type}
					>
						<p>{notificationText(locale, item)}</p>
						<time dateTime={item.createdAt}>
							{new Intl.DateTimeFormat(locale, {
								dateStyle: "medium",
								timeStyle: "short",
							}).format(new Date(item.createdAt))}
						</time>
						{!item.target.available ? (
							<p>{t.unavailable}</p>
						) : item.type === "FOLLOW" ? (
							<Link
								to="/$locale/user/$id"
								params={{ locale, id: item.target.id }}
							>
								{locale === "fr" ? "Voir le profil" : "View profile"}
							</Link>
						) : (
							<Link
								to="/$locale/post/$id"
								params={{ locale, id: item.target.id }}
							>
								{locale === "fr" ? "Voir la publication" : "View post"}
							</Link>
						)}
						{!item.readAt && (
							<Button
								disabled={change.isPending}
								onClick={() =>
									change.mutate({ viewerId, mode: "one", id: item.id })
								}
							>
								{t.mark}
							</Button>
						)}
					</li>
				))}
			</ul>
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
