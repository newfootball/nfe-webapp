import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import {
	addComment,
	commentsOptions,
	deletePostComment,
	interactionOptions,
	setInteraction,
} from "../../lib/interactions";
import {
	type CommentPage,
	type InteractionChange,
	optimisticInteraction,
} from "../../lib/interactions-contract";
import { interactionMessages } from "../../lib/interactions-messages";
import type { Locale } from "../../lib/messages";

type Change =
	| { kind: "like" | "favorite"; active: boolean }
	| { kind: "create"; content: string; requestId: string }
	| { kind: "delete"; commentId: string };
export function SocialInteractions({
	id,
	locale,
}: {
	id: string;
	locale: Locale;
}) {
	const client = useQueryClient(),
		t = interactionMessages[locale],
		options = interactionOptions(id),
		query = useQuery(options);
	const [expanded, setExpanded] = useState(false),
		[content, setContent] = useState(""),
		requestId = useRef<string | null>(null);
	const co = commentsOptions(id),
		comments = useInfiniteQuery({ ...co, enabled: expanded });
	const change = useMutation({
		mutationFn: async (v: Change): Promise<InteractionChange> => {
			const r =
				v.kind === "create"
					? await addComment({
							data: { id, content: v.content, requestId: v.requestId },
						})
					: v.kind === "delete"
						? await deletePostComment({ data: { id, commentId: v.commentId } })
						: await setInteraction({ data: { id, ...v } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		onMutate: async (v) => {
			await Promise.all([
				client.cancelQueries({ queryKey: options.queryKey }),
				client.cancelQueries({ queryKey: co.queryKey }),
			]);
			const state = client.getQueryData(options.queryKey),
				priorComments = client.getQueryData(co.queryKey),
				ownerQuery = client
					.getQueryCache()
					.find({ queryKey: options.queryKey, exact: true }),
				commentQuery = client
					.getQueryCache()
					.find({ queryKey: co.queryKey, exact: true });
			if (state) {
				if (v.kind === "like" || v.kind === "favorite")
					client.setQueryData(
						options.queryKey,
						optimisticInteraction(state, v.kind, v.active),
					);
				else
					client.setQueryData(options.queryKey, {
						...state,
						comments: Math.max(
							0,
							state.comments + (v.kind === "create" ? 1 : -1),
						),
					});
				if (v.kind === "delete")
					client.setQueryData<InfiniteData<CommentPage>>(co.queryKey, (old) =>
						old
							? {
									...old,
									pages: old.pages.map((p) => ({
										...p,
										comments: p.comments.filter((c) => c.id !== v.commentId),
									})),
								}
							: old,
					);
				if (v.kind === "create" && state.viewerId)
					client.setQueryData<InfiniteData<CommentPage>>(co.queryKey, (old) =>
						old
							? {
									...old,
									pages: old.pages.map((p, i) =>
										i
											? p
											: {
													...p,
													comments: [
														...p.comments,
														{
															id: `pending-${v.requestId}`,
															content: v.content,
															createdAt: new Date().toISOString(),
															author: { id: state.viewerId ?? "", name: null },
															canDelete: false,
														},
													],
												},
									),
								}
							: old,
					);
			}
			return { state, priorComments, ownerQuery, commentQuery };
		},
		onError: (_e, _v, ctx) => {
			if (
				ctx?.ownerQuery &&
				client
					.getQueryCache()
					.find({ queryKey: options.queryKey, exact: true }) ===
					ctx.ownerQuery &&
				ctx.state
			)
				client.setQueryData(options.queryKey, ctx.state);
			if (
				ctx?.commentQuery &&
				client.getQueryCache().find({ queryKey: co.queryKey, exact: true }) ===
					ctx.commentQuery &&
				ctx.priorComments
			)
				client.setQueryData(co.queryKey, ctx.priorComments);
		},
		onSuccess: (r, v, ctx) => {
			// Object identity survives normal updates, but not clearIdentityCache; also
			// guards an A→B→A switch while a mutation is still in flight.
			if (
				ctx?.ownerQuery &&
				client
					.getQueryCache()
					.find({ queryKey: options.queryKey, exact: true }) ===
					ctx.ownerQuery &&
				ctx.state?.viewerId === r.state.viewerId
			) {
				client.setQueryData(options.queryKey, r.state);
				if (v.kind === "create" && requestId.current === v.requestId) {
					setContent("");
					requestId.current = null;
				}
			}
		},
		onSettled: async () => {
			await Promise.all([
				...["interactions", "feed", "post", "explore"].map((key) =>
					client.invalidateQueries({ queryKey: [key] }),
				),
			]);
		},
	});
	if (query.isPending) return <p role="status">{t.loading}</p>;
	if (query.isError)
		return (
			<div role="alert">
				{t.error} <Button onClick={() => query.refetch()}>{t.retry}</Button>
			</div>
		);
	const s = query.data;
	return (
		<section
			className="mt-4 space-y-3"
			aria-label={t.comments}
			data-testid="social-interactions"
		>
			<p data-testid="interaction-counts">
				{t.like}: {s.likes} · {t.comments}: {s.comments}
			</p>
			{s.viewerId ? (
				<div className="flex flex-wrap gap-3">
					<Button
						disabled={change.isPending}
						aria-pressed={s.liked}
						onClick={() => change.mutate({ kind: "like", active: !s.liked })}
					>
						{s.liked ? t.unlike : t.like}
					</Button>
					<Button
						disabled={change.isPending}
						aria-pressed={s.favorited}
						onClick={() =>
							change.mutate({ kind: "favorite", active: !s.favorited })
						}
					>
						{s.favorited ? t.unfavorite : t.favorite}
					</Button>
					<Link to="/$locale/profile/favorites" params={{ locale }}>
						{t.favorites}
					</Link>
				</div>
			) : (
				<Link
					to="/$locale/sign-in"
					params={{ locale }}
					search={{ returnTo: `/${locale}/post/${id}` }}
				>
					{t.signIn}
				</Link>
			)}
			<Button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
				{t.comments}
			</Button>
			{expanded && (
				<div className="space-y-3">
					{comments.isPending && <p role="status">{t.loading}</p>}
					{comments.isError && (
						<p role="alert">
							{t.error}{" "}
							<Button onClick={() => comments.refetch()}>{t.retry}</Button>
						</p>
					)}
					{comments.data?.pages
						.flatMap((p) => p.comments)
						.map((c) => (
							<article key={c.id} data-comment-id={c.id}>
								<p>{c.author.name ?? t.anonymous}</p>
								<p className="whitespace-pre-wrap break-words">{c.content}</p>
								{c.canDelete && (
									<Button
										disabled={change.isPending}
										onClick={() =>
											change.mutate({ kind: "delete", commentId: c.id })
										}
									>
										{t.delete}
									</Button>
								)}
							</article>
						))}
					{comments.hasNextPage && (
						<Button
							disabled={comments.isFetchingNextPage}
							onClick={() => comments.fetchNextPage()}
						>
							{t.more}
						</Button>
					)}
					{s.viewerId && (
						<form
							onSubmit={(e) => {
								e.preventDefault();
								const token = requestId.current ?? crypto.randomUUID();
								requestId.current = token;
								change.mutate({ kind: "create", content, requestId: token });
							}}
							className="space-y-3"
						>
							<label className="block">
								{t.content}
								<textarea
									required
									maxLength={1000}
									value={content}
									onChange={(e) => {
										setContent(e.target.value);
										requestId.current = null;
									}}
									className="block w-full rounded border p-3"
								/>
							</label>
							<Button
								type="submit"
								disabled={change.isPending || !content.trim()}
							>
								{change.isPending ? t.sending : t.comment}
							</Button>
						</form>
					)}
				</div>
			)}
			{change.isError && <p role="alert">{t.error}</p>}
			{change.isSuccess && <p role="status">{t.updated}</p>}
		</section>
	);
}
