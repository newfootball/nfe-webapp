import { Link } from "@tanstack/react-router";
import type { PublicPost } from "../../lib/feed-contract";
import { ago } from "../../lib/home-contract";
import { homeMessages } from "../../lib/home-messages";
import type { Locale } from "../../lib/messages";
import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";
import { SectionHead, sectionLink } from "./section-head";
import { Thumb } from "./thumb";

export function LockerRow({
	posts,
	suggested,
	locale,
	now,
}: {
	posts: PublicPost[];
	suggested: boolean;
	locale: Locale;
	now: number;
}) {
	const t = homeMessages[locale];
	return (
		<section aria-labelledby="locker-title">
			<SectionHead id="locker-title" title={t.locker}>
				{suggested ? (
					<Link
						to="/$locale/explore"
						params={{ locale }}
						search={{ q: "", tab: "users" }}
						className={sectionLink}
					>
						{t.lockerFresh}
					</Link>
				) : (
					<Link
						to="/$locale/profile/follows"
						params={{ locale }}
						search={{ direction: "following" }}
						className={sectionLink}
					>
						{t.lockerLink}
					</Link>
				)}
			</SectionHead>
			{posts.length === 0 ? (
				<p className="flex items-center justify-between gap-4 border-y mx-4 py-3 text-[13px] text-muted-foreground sm:mx-0">
					{t.lockerEmpty}
					<Link
						to="/$locale/explore"
						params={{ locale }}
						search={{ q: "", tab: "users" }}
						className={cn(
							buttonVariants({ variant: "link", size: "inline" }),
							"shrink-0",
						)}
					>
						{t.explore}
					</Link>
				</p>
			) : (
				<ul className="overflow-x-auto flex gap-3.5 px-4 pb-1.5 snap-x scroll-px-4 scrollbar-none sm:px-0 sm:scroll-px-0">
					{posts.map((post) => (
						<li key={post.id} className="shrink-0 w-[150px] snap-start">
							<Link
								to="/$locale/post/$id"
								params={{ locale, id: post.id }}
								className="block group"
							>
								<span className="overflow-hidden block h-[190px] rounded-md pitch">
									<Thumb
										src={post.mediaPreview}
										lazy
										className="object-cover size-full transition-transform duration-700 group-hover:scale-104"
									/>
								</span>
								<b className="mt-2 line-clamp-2 leading-tight font-medium text-[12.5px]">
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
