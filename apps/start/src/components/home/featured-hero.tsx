import { Link } from "@tanstack/react-router";
import type { Featured } from "../../lib/home-contract";
import { homeMessages } from "../../lib/home-messages";
import type { Locale } from "../../lib/messages";
import { PinButton } from "./pin-button";
import { Thumb } from "./thumb";

// The last word carries the yellow, like a broadcast lower third.
function split(title: string) {
	const at = title.trimEnd().lastIndexOf(" ");
	return at > 0 ? [title.slice(0, at), title.slice(at + 1)] : ["", title];
}
export function FeaturedHero({
	featured,
	locale,
	canPin,
}: {
	featured: Featured;
	locale: Locale;
	canPin: boolean;
}) {
	const t = homeMessages[locale],
		{ post } = featured,
		[head, tail] = split(post.title);
	const views = new Intl.NumberFormat(locale).format(featured.views);
	return (
		<section
			aria-labelledby="featured-title"
			className="relative sm:overflow-hidden sm:rounded-md"
		>
			<Link
				to="/$locale/post/$id"
				params={{ locale, id: post.id }}
				className="overflow-hidden relative block h-[330px] pitch group sm:h-105"
			>
				<Thumb
					src={post.mediaPreview}
					className="object-cover absolute inset-0 size-full transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-104"
				/>
				<span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,rgb(0_0_0/0.55)_55%,rgb(0_0_0/0.88))]" />
				<span className="absolute right-4 bottom-4 left-4 block text-white sm:right-6 sm:bottom-6 sm:left-6">
					<span className="font-label font-medium tracking-[0.16em] uppercase text-[11.5px] text-white/75">
						{featured.pinned ? t.pinned : t.featured} · Nº {featured.weekNumber}
					</span>
					<h2
						id="featured-title"
						className="mt-2 mb-2.5 line-clamp-3 font-display leading-[0.92] font-normal uppercase text-[40px] sm:text-6xl [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]"
					>
						{head && <>{head} </>}
						<span className="text-primary">{tail}</span>
					</h2>
					<span className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-white/85">
						<span>
							{post.author.name}
							{post.author.club?.name && `, ${post.author.club.name}`}
						</span>
						{featured.views > 0 && (
							<>
								<i aria-hidden="true" className="h-2.5 w-px bg-white/50" />
								<span className="tabular-nums">{t.viewsCount(views)}</span>
							</>
						)}
					</span>
				</span>
			</Link>
			{canPin && featured.pinned && (
				<PinButton
					id={null}
					locale={locale}
					className="absolute top-3 right-3 bg-black/60 text-white"
				/>
			)}
		</section>
	);
}
