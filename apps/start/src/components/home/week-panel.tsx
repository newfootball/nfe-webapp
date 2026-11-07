import { Link } from "@tanstack/react-router";
import { compact, type WeekStats } from "../../lib/home-contract";
import { homeMessages } from "../../lib/home-messages";
import { type Locale, messages } from "../../lib/messages";
import { buttonVariants } from "../ui/button";
import { Icon } from "./icon";

const kicker =
	"font-label text-[11.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase";
function Cell({
	value,
	label,
	delta,
}: {
	value: string;
	label: string;
	delta?: string | null;
}) {
	return (
		<div className="flex-1 min-w-0 px-2.5 py-2 [&+&]:border-l">
			<b className="block font-display text-lg leading-none font-normal tabular-nums">
				{value}
			</b>
			<small className="block truncate text-[10.5px] text-muted-foreground">
				{label}
				{delta && <span className="ml-1 font-medium text-amber">{delta}</span>}
			</small>
		</div>
	);
}
// Scoreboard strip: the week in one line so the featured video owns the first screen.
export function WeekPanel({
	week,
	locale,
}: {
	week: WeekStats;
	locale: Locale;
}) {
	const t = homeMessages[locale];
	const missing = week.completion.missing;
	const trend =
		week.viewsTrend === null
			? null
			: `${week.viewsTrend > 0 ? "+" : ""}${week.viewsTrend}${locale === "fr" ? " %" : "%"}`;
	return (
		<section aria-labelledby="week-title">
			<div className="flex items-stretch border-b sm:border-t">
				<h2
					id="week-title"
					className="grid place-items-center px-3 font-display text-[13px] tracking-[0.06em] bg-foreground text-background tabular-nums"
				>
					<span aria-hidden="true">{t.weekShort(week.weekNumber)}</span>
					<span className="sr-only">{t.weekLabel(week.weekNumber)}</span>
				</h2>
				<div className="flex flex-1 min-w-0">
					<Cell value={String(week.posts)} label={t.videos} />
					<Cell
						value={compact(week.views, locale)}
						label={t.views}
						delta={trend}
					/>
					<Cell
						value={compact(week.followers, locale)}
						label={t.followers}
						delta={week.newFollowers > 0 ? `+${week.newFollowers}` : null}
					/>
				</div>
				<Link
					to="/$locale/profile"
					params={{ locale }}
					aria-label={t.profile}
					className="grid place-items-center border-l px-3 text-muted-foreground transition-colors hover:text-foreground"
				>
					<Icon name="arrow" className="size-4.5" />
				</Link>
			</div>
			{missing && (
				<div className="flex items-center gap-3 border-b px-4 py-2.5 text-[12.5px] sm:px-0">
					<div className="flex-1">
						{t.completion(week.completion.percent)}
						<div className="h-0.5 mt-1.5 bg-muted">
							<i
								className="block h-full bg-primary"
								style={{ width: `${week.completion.percent}%` }}
							/>
						</div>
					</div>
					<Link
						to="/$locale/profile/edit-user"
						params={{ locale }}
						className={buttonVariants({ variant: "link", size: "inline" })}
					>
						{t.missing[missing]}
					</Link>
				</div>
			)}
		</section>
	);
}
export function JoinPanel({
	locale,
	reader,
}: {
	locale: Locale;
	reader: string;
}) {
	const t = homeMessages[locale],
		m = messages[locale];
	return (
		<section className="px-4 sm:px-0">
			<p className={kicker}>{t.joinKicker}</p>
			<h1 className="mt-1.5 font-display leading-[0.95] font-normal uppercase text-[40px] sm:text-5xl">
				{m.title}
			</h1>
			<p className="max-w-md mt-3 leading-snug text-[15px] text-muted-foreground">
				{m.intro}
			</p>
			<div className="flex flex-wrap items-center gap-5 border-y mt-5 py-3">
				<Link
					to="/sign-up"
					search={{ returnTo: `/${locale}` }}
					className={buttonVariants()}
				>
					{t.joinCta}
				</Link>
				<Link
					to="/$locale/sign-in"
					params={{ locale }}
					search={{ returnTo: `/${locale}` }}
					className={buttonVariants({ variant: "link", size: "inline" })}
				>
					{t.signIn}
				</Link>
			</div>
			<p data-testid="reader" className="sr-only">
				{reader}
			</p>
		</section>
	);
}
