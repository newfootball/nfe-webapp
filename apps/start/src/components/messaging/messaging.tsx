import {
	type InfiniteData,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import type { Locale } from "../../lib/messages";
import {
	conversationsOptions,
	markRead,
	messageHistoryOptions,
	messagePeersOptions,
	messagingKey,
	sendMessage,
} from "../../lib/messaging";
import type { MessagePage, MessagingError } from "../../lib/messaging-contract";
import { messagingMessages } from "../../lib/messaging-messages";

function errorText(error: unknown, locale: Locale) {
	const key = error instanceof Error ? error.message : String(error);
	return (
		messagingMessages[locale].errors[key as MessagingError] ??
		messagingMessages[locale].errors.unavailable
	);
}
export function ConversationList({
	ownerId,
	locale,
}: {
	ownerId: string;
	locale: Locale;
}) {
	const [q, setQ] = useState("");
	const t = messagingMessages[locale],
		list = useInfiniteQuery(conversationsOptions(ownerId)),
		search = useQuery(messagePeersOptions(ownerId, q));
	return (
		<section className="space-y-5">
			<h1 className="text-2xl font-bold">{t.title}</h1>
			<p>{t.policy}</p>
			<label className="block">
				{t.search}
				<input
					className="block w-full rounded border p-2"
					maxLength={80}
					value={q}
					onChange={(e) => setQ(e.target.value)}
				/>
			</label>
			{search.isFetching && <p role="status">{t.loading}</p>}
			{search.isError && <p role="alert">{errorText(search.error, locale)}</p>}
			{q.trim().length >= 2 && (
				<ul>
					{search.data?.peers.map((p) => (
						<li key={p.id}>
							<Link to="/$locale/messages/$id" params={{ locale, id: p.id }}>
								{p.name ?? p.id}
							</Link>
						</li>
					))}
				</ul>
			)}
			{list.isPending && <p role="status">{t.loading}</p>}
			{list.isError && (
				<p role="alert">
					{errorText(list.error, locale)}{" "}
					<Button onClick={() => list.refetch()}>{t.retry}</Button>
				</p>
			)}
			<ul className="space-y-4">
				{list.data?.pages
					.flatMap((p) => p.conversations)
					.map((c) => (
						<li key={c.id} className="rounded border p-3">
							<Link
								to="/$locale/messages/$id"
								params={{ locale, id: c.peer.id }}
							>
								{c.peer.name ?? c.peer.id}
							</Link>
							<p>{c.latest.content}</p>
							<time dateTime={c.latest.createdAt}>
								{new Date(c.latest.createdAt).toLocaleString(locale, {
									timeZone: "UTC",
								})}
							</time>
							<p>
								{t.unread}: {c.unread}
							</p>
						</li>
					))}
			</ul>
			{list.data?.pages.every((p) => !p.conversations.length) && (
				<p>{t.empty}</p>
			)}
			{list.hasNextPage && (
				<Button
					disabled={list.isFetchingNextPage}
					onClick={() => list.fetchNextPage()}
				>
					{t.more}
				</Button>
			)}
			<Button onClick={() => list.refetch()}>{t.refresh}</Button>
		</section>
	);
}
export function MessageThread({
	ownerId,
	peerId,
	locale,
}: {
	ownerId: string;
	peerId: string;
	locale: Locale;
}) {
	const t = messagingMessages[locale],
		client = useQueryClient(),
		options = messageHistoryOptions(ownerId, peerId),
		history = useInfiniteQuery(options);
	const [content, setContent] = useState(""),
		[notice, setNotice] = useState(""),
		[sending, setSending] = useState(false),
		[reading, setReading] = useState(false);
	const retry = useRef<{ content: string; requestId: string } | null>(null),
		live = useRef(true);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	const messages = history.data?.pages.flatMap((p) => p.messages) ?? [];
	const unread = messages
		.filter((m) => m.toUserId === ownerId && !m.readAt)
		.map((m) => m.id)
		.slice(0, 30);
	async function send() {
		if (sending || !content.trim()) return;
		setSending(true);
		setNotice("");
		const text = content.trim();
		if (retry.current?.content !== text)
			retry.current = { content: text, requestId: crypto.randomUUID() };
		const request = retry.current;
		await client.cancelQueries({ queryKey: options.queryKey });
		const before = client.getQueryData<InfiniteData<MessagePage>>(
			options.queryKey,
		);
		const at = new Date().toISOString(),
			optimisticId = `pending-${request.requestId}`;
		if (before)
			client.setQueryData<InfiniteData<MessagePage>>(options.queryKey, {
				...before,
				pages: before.pages.map((page, i) =>
					i === 0
						? {
								...page,
								messages: [
									{
										id: optimisticId,
										fromUserId: ownerId,
										toUserId: peerId,
										content: text,
										createdAt: at,
										updatedAt: at,
										readAt: null,
									},
									...page.messages,
								],
							}
						: page,
				),
			});
		try {
			const r = await sendMessage({ data: { toUserId: peerId, ...request } });
			if (!live.current || !client.getQueryState(options.queryKey)) return;
			if (!r.ok) throw new Error(r.error);
			if (r.value.ownerId !== ownerId) throw new Error("unauthorized");
			setContent("");
			retry.current = null;
			await client.invalidateQueries({ queryKey: messagingKey(ownerId) });
		} catch (e) {
			if (live.current && client.getQueryState(options.queryKey)) {
				if (before) client.setQueryData(options.queryKey, before);
				setNotice(errorText(e, locale));
			}
		} finally {
			if (live.current) setSending(false);
		}
	}
	return (
		<section className="space-y-5">
			<Link to="/$locale/messages" params={{ locale }}>
				{t.back}
			</Link>
			<h1 className="text-2xl font-bold">{t.title}</h1>
			<p>{peerId}</p>
			{history.isPending && <p role="status">{t.loading}</p>}
			{history.isError && (
				<p role="alert">
					{errorText(history.error, locale)}{" "}
					<Button onClick={() => history.refetch()}>{t.retry}</Button>
				</p>
			)}
			{history.hasNextPage && (
				<Button
					disabled={history.isFetchingNextPage}
					onClick={() => history.fetchNextPage()}
				>
					{t.more}
				</Button>
			)}
			<ol className="space-y-3">
				{[...messages].reverse().map((m) => (
					<li key={m.id} className="rounded border p-3" data-message-id={m.id}>
						<p>{m.content}</p>
						<time dateTime={m.createdAt}>
							{new Date(m.createdAt).toLocaleString(locale, {
								timeZone: "UTC",
							})}
						</time>
						<p>
							{m.id.startsWith("pending-")
								? t.pending
								: m.readAt
									? t.read
									: t.unread}
						</p>
					</li>
				))}
			</ol>
			{history.data && !messages.length && <p>{t.emptyHistory}</p>}
			<Button onClick={() => history.refetch()}>{t.refresh}</Button>
			{unread.length > 0 && (
				<Button
					disabled={reading}
					onClick={async () => {
						setReading(true);
						setNotice("");
						try {
							const r = await markRead({ data: { ids: unread } });
							if (!r.ok) throw new Error(r.error);
							if (live.current && client.getQueryState(options.queryKey))
								await client.invalidateQueries({
									queryKey: messagingKey(ownerId),
								});
						} catch (e) {
							if (live.current) setNotice(errorText(e, locale));
						} finally {
							if (live.current) setReading(false);
						}
					}}
				>
					{t.markRead}
				</Button>
			)}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					void send();
				}}
				className="space-y-3"
			>
				<label className="block">
					{t.content}
					<textarea
						className="block w-full rounded border p-3"
						required
						minLength={1}
						maxLength={2000}
						value={content}
						disabled={sending}
						onChange={(e) => setContent(e.target.value)}
					/>
				</label>
				<Button type="submit" disabled={sending || !content.trim()}>
					{sending ? t.pending : t.send}
				</Button>
			</form>
			{notice && <p role="alert">{notice}</p>}
		</section>
	);
}
