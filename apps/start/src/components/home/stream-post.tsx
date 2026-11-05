import { Link } from "@tanstack/react-router";
import type { PublicPost } from "../../lib/feed-contract";
import { markViewed } from "../../lib/home";
import { ago, teamCode } from "../../lib/home-contract";
import { homeMessages } from "../../lib/home-messages";
import type { Locale } from "../../lib/messages";
import { positionMessages } from "../../lib/profile-messages";
import { MediaPlayer } from "../media/media-player";
import { ActionBar } from "./action-bar";
import { Jersey } from "./jersey";
import { PinButton } from "./pin-button";

function BroadcastBug({ post, locale }: { post: PublicPost; locale: Locale }) {
	const m = post.match;
	if (!m) return null;
	const t = homeMessages[locale],
		own = post.author.club?.name;
	const said = [
		t.against(m.opponent),
		`${m.scoreFor}–${m.scoreAgainst}`,
		m.minute === null ? null : t.minute(m.minute),
	]
		.filter(Boolean)
		.join(", ");
	return (
		<p className="pointer-events-none absolute top-2.5 left-2.5 flex text-[10.5px] font-semibold tracking-[0.04em] text-white tabular-nums">
			<span className="sr-only">{said}</span>
			<span aria-hidden="true" className="flex">
				{own && (
					<span className="bg-black/78 px-1.5 py-1">{teamCode(own)}</span>
				)}
				<span className="bg-black/78 px-1.5 py-1">
					{m.scoreFor}–{m.scoreAgainst}
				</span>
				<span className="bg-black/78 px-1.5 py-1">{teamCode(m.opponent)}</span>
				{m.minute !== null && (
					<span className="bg-primary px-1.5 py-1 text-primary-foreground">
						{m.minute}'
					</span>
				)}
			</span>
		</p>
	);
}
function role(post: PublicPost, locale: Locale) {
	const positions = positionMessages[locale] as Record<string, string>,
		first = post.author.position[0];
	return [
		first ? positions[first] : null,
		post.author.club?.name ?? post.author.localisation,
	]
		.filter(Boolean)
		.join(" · ");
}
export function StreamPost({
	post,
	locale,
	now,
	canPin,
}: {
	post: PublicPost;
	locale: Locale;
	now: number;
	canPin: boolean;
}) {
	const by = role(post, locale);
	return (
		<article data-post-id={post.id} className="border-t pt-3.5 pb-5">
			<header className="flex items-center gap-2.5 px-4 pb-2.5 sm:px-0">
				<Link to="/$locale/user/$id" params={{ locale, id: post.author.id }}>
					<Jersey
						number={post.author.jerseyNumber}
						name={post.author.name}
						image={post.author.image}
					/>
				</Link>
				<div className="min-w-0">
					<Link
						to="/$locale/user/$id"
						params={{ locale, id: post.author.id }}
						className="block truncate text-[13.5px] font-semibold"
					>
						{post.author.name}
					</Link>
					{by && (
						<small className="block truncate text-[11.5px] text-muted-foreground">
							{by}
						</small>
					)}
				</div>
				<time
					dateTime={post.publishedAt ?? post.createdAt}
					className="ml-auto text-[11.5px] text-muted-foreground/70 tabular-nums"
				>
					{ago(post.publishedAt ?? post.createdAt, locale, now)}
				</time>
			</header>
			<div className="sm:overflow-hidden sm:rounded-md">
				<MediaPlayer
					postId={post.id}
					locale={locale}
					title={post.title}
					bleed
					onPlaying={() =>
						void markViewed({ data: { id: post.id } }).catch(() => {})
					}
				>
					<BroadcastBug post={post} locale={locale} />
				</MediaPlayer>
			</div>
			<div className="px-4 pt-3 sm:px-0">
				<ActionBar post={post} locale={locale} />
				<p className="mt-2.5 line-clamp-3 text-sm leading-[1.45] break-words">
					<Link
						to="/$locale/post/$id"
						params={{ locale, id: post.id }}
						className="font-medium"
					>
						{post.title}
					</Link>
					{post.description && (
						<span className="text-muted-foreground"> {post.description}</span>
					)}
				</p>
				{canPin && (
					<PinButton
						id={post.id}
						locale={locale}
						className="-ml-2 mt-2 text-muted-foreground"
					/>
				)}
			</div>
		</article>
	);
}
