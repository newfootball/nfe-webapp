import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "../../../../../components/ui/button";
import { followOptions, setFollowing } from "../../lib/follow";
import { optimisticFollow } from "../../lib/follow-contract";
import { followMessages } from "../../lib/follow-messages";
import type { Locale } from "../../lib/messages";

export function FollowControls({ id, locale }: { id: string; locale: Locale }) {
	const client = useQueryClient(),
		t = followMessages[locale];
	const options = followOptions(id),
		query = useQuery(options);
	const change = useMutation({
		mutationFn: async (following: boolean) => {
			const r = await setFollowing({ data: { id, following } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		onMutate: async (following) => {
			await client.cancelQueries({ queryKey: options.queryKey });
			const previous = client.getQueryData(options.queryKey);
			if (previous)
				client.setQueryData(
					options.queryKey,
					optimisticFollow(previous, following),
				);
			return previous;
		},
		onError: (_error, _variables, previous) => {
			if (
				previous &&
				client.getQueryData(options.queryKey)?.viewerId === previous.viewerId
			)
				client.setQueryData(options.queryKey, previous);
		},
		onSuccess: (result) => {
			// If identity changed while this mutation was in flight, do not restore
			// a cache that clearIdentityCache already removed.
			if (
				client.getQueryData(options.queryKey)?.viewerId ===
				result.state.viewerId
			)
				client.setQueryData(options.queryKey, result.state);
		},
		onSettled: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: ["follows"] }),
				client.invalidateQueries({ queryKey: ["explore"] }),
			]);
		},
	});
	if (query.isPending) return <p role="status">{t.loading}</p>;
	if (query.isError)
		return (
			<p role="alert">
				{t.error} <Button onClick={() => query.refetch()}>{t.retry}</Button>
			</p>
		);
	const state = query.data;
	return (
		<section className="my-4 space-y-3" aria-label={t.lists}>
			<p data-testid="follow-counts">
				{t.followers}: {state.followers} · {t.following}: {state.followings}
			</p>
			{!state.viewerId ? (
				<Link
					to="/$locale/sign-in"
					params={{ locale }}
					search={{ returnTo: `/${locale}/user/${id}` }}
				>
					{t.signIn}
				</Link>
			) : state.viewerId === id ? (
				<Link
					to="/$locale/profile/follows"
					params={{ locale }}
					search={{ direction: "following" }}
				>
					{t.lists}
				</Link>
			) : (
				<Button
					disabled={change.isPending}
					aria-pressed={state.following}
					onClick={() => change.mutate(!state.following)}
				>
					{state.following ? t.unfollow : t.follow}
				</Button>
			)}
			{change.isError && <p role="alert">{t.error}</p>}
			{change.isSuccess && <p role="status">{t.updated}</p>}
		</section>
	);
}
