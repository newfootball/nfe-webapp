import { Link } from "@tanstack/react-router";
import type { PublicPost } from "../../lib/feed-contract";
import { ago } from "../../lib/home-contract";
import { homeMessages } from "../../lib/home-messages";
import type { Locale } from "../../lib/messages";
import { SectionHead, sectionLink } from "./section-head";
import { Thumb } from "./thumb";

export function LockerRow({
	posts,
	locale,
	now,
}: {
	posts: PublicPost[];
	locale: Locale;
	now: number;
}) {
	const t = homeMessages[locale];
	return (
		<section aria-labelledby="locker-title">
			<SectionHead id="locker-title" title={t.locker}>
				<Link
					to="/$locale/profile/follows"
					params={{ locale }}
					search={{ direction: "following" }}
					className={sectionLink}
				>
					{t.lockerLink}
				</Link>
			</SectionHead>
			{posts.length === 0 ? (
				<p className="mx-4 flex items-center justify-between gap-4 border-y py-3 text-[13px] text-muted-foreground sm:mx-0">
					{t.lockerEmpty}
					<Link
						to="/$locale/explore"
						params={{ locale }}
						search={{ q: "", tab: "users" }}
						className="shrink-0 border-b border-foreground text-xs font-semibold text-foreground"
					>
						{t.explore}
					</Link>
				</p>
			) : (
				<ul className="scrollbar-none flex snap-x scroll-px-4 sm:scroll-px-0 gap-3.5 overflow-x-auto px-4 pb-1.5 sm:px-0">
					{posts.map((post) => (
						<li key={post.id} className="w-[150px] shrink-0 snap-start">
							<Link
								to="/$locale/post/$id"
								params={{ locale, id: post.id }}
								className="group block"
							>
								<span className="block h-[190px] overflow-hidden rounded-md bg-pitch">
									<Thumb
										src={post.mediaPreview}
										lazy
										className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
									/>
								</span>
								<b className="mt-2 line-clamp-2 text-[12.5px] leading-tight font-medium">
									{post.title}
								</b>
								<small className="text-[11px] text-muted-foreground">
									{post.author.name} ·{" "}
									{ago(post.publishedAt ?? post.createdAt, locale, now)}
								</small>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
