import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { PublicPost } from "../../lib/feed-contract";
import { interactionOptions, setInteraction } from "../../lib/interactions";
import { optimisticInteraction } from "../../lib/interactions-contract";
import { interactionMessages } from "../../lib/interactions-messages";
import type { Locale } from "../../lib/messages";
import { Icon } from "./icon";

type Toggle = { kind: "like" | "favorite"; active: boolean };
// Compact like / comment / save row; counts start from the feed snapshot.
export function ActionBar({
	post,
	locale,
}: {
	post: PublicPost;
	locale: Locale;
}) {
	const t = interactionMessages[locale],
		client = useQueryClient(),
		navigate = useNavigate(),
		options = interactionOptions(post.id),
		state = useQuery(options).data;
	const toggle = useMutation({
		mutationFn: async (v: Toggle) => {
			const r = await setInteraction({ data: { id: post.id, ...v } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		onMutate: async (v) => {
			await client.cancelQueries({ queryKey: options.queryKey });
			const prior = client.getQueryData(options.queryKey);
			if (prior)
				client.setQueryData(
					options.queryKey,
					optimisticInteraction(prior, v.kind, v.active),
				);
			return { prior };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.prior) client.setQueryData(options.queryKey, ctx.prior);
		},
		onSuccess: (r) => client.setQueryData(options.queryKey, r.state),
	});
	const signedOut = state ? !state.viewerId : false;
	const act = (kind: Toggle["kind"], active: boolean) =>
		signedOut
			? navigate({
					to: "/$locale/sign-in",
					params: { locale },
					search: { returnTo: `/${locale}/post/${post.id}` },
				})
			: toggle.mutate({ kind, active });
	const liked = state?.liked ?? false,
		saved = state?.favorited ?? false;
	const base =
		"inline-flex items-center gap-1.5 transition-colors hover:text-foreground disabled:opacity-60";
	return (
		<div className="flex items-center gap-5 text-[12.5px] text-muted-foreground tabular-nums">
			<button
				type="button"
				aria-pressed={liked}
				aria-label={liked ? t.unlike : t.like}
				disabled={!state || toggle.isPending}
				onClick={() => act("like", !liked)}
				className={base}
			>
				<Icon
					name="heart"
					className={`size-[19px] ${liked ? "fill-primary text-amber" : ""}`}
				/>
				{state?.likes ?? post._count.likes}
			</button>
			<Link
				to="/$locale/post/$id"
				params={{ locale, id: post.id }}
				aria-label={t.comments}
				className={base}
			>
				<Icon name="comment" className="size-[19px]" />
				{state?.comments ?? post._count.comments}
			</Link>
			<button
				type="button"
				aria-pressed={saved}
				aria-label={saved ? t.unfavorite : t.favorite}
				disabled={!state || toggle.isPending}
				onClick={() => act("favorite", !saved)}
				className={`${base} ml-auto`}
			>
				<Icon
					name="save"
					className={`size-[19px] ${saved ? "fill-primary text-amber" : ""}`}
				/>
			</button>
		</div>
	);
}
