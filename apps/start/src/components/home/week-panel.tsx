import { Link } from "@tanstack/react-router";
import { compact, type WeekStats } from "../../lib/home-contract";
import { homeMessages } from "../../lib/home-messages";
import { type Locale, messages } from "../../lib/messages";
import { buttonVariants } from "../ui/button";

const kicker =
	"font-label text-[11.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase";
function range(w: WeekStats, locale: Locale) {
	const day = new Intl.DateTimeFormat(locale, {
			day: "numeric",
			timeZone: "UTC",
		}),
		full = new Intl.DateTimeFormat(locale, {
			day: "numeric",
			month: "short",
			timeZone: "UTC",
		});
	return `${day.format(new Date(w.weekStart))} → ${full.format(new Date(w.weekEnd))}`;
}
function Stat({
	value,
	label,
	delta,
}: {
	value: string;
	label: string;
	delta?: string | null;
}) {
	return (
		<div className="py-2.5 pb-3 [&+&]:border-l [&+&]:pl-3">
			<b className="block font-display text-3xl leading-none font-light tabular-nums">
				{value}
			</b>
			<small className="tracking-wide text-[10.5px] text-muted-foreground">
				{label}
				{delta && <span className="ml-1 font-medium text-amber">{delta}</span>}
			</small>
		</div>
	);
}
export function WeekPanel({
	week,
	locale,
}: {
	week: WeekStats;
	locale: Locale;
}) {
	const t = homeMessages[locale],
		first = week.name?.split(/\s+/)[0] ?? "",
		line = week.topTitle && week.views > 0 ? t.rolling(week.topTitle) : t.quiet;
	const missing = week.completion.missing;
	const trend =
		week.viewsTrend === null
			? null
			: `${week.viewsTrend > 0 ? "+" : ""}${week.viewsTrend}${locale === "fr" ? " %" : "%"}`;
	return (
		<section aria-labelledby="week-title" className="px-4 sm:px-0">
			<p className={kicker}>
				{t.week} · {range(week, locale)}
			</p>
			<h2
				id="week-title"
				className="mt-1.5 font-display leading-[1.05] font-normal uppercase text-[26px]"
			>
				{first ? t.hello(first) : null}
				<br />
				{line.before} <span className="highlight">{line.mark}</span>.
			</h2>
			<div className="grid grid-cols-3 border-y border-t-foreground border-b-hair mt-3.5">
				<Stat value={String(week.posts)} label={t.videos} />
				<Stat
					value={compact(week.views, locale)}
					label={t.views}
					delta={trend}
				/>
				<Stat
					value={compact(week.followers, locale)}
					label={t.followers}
					delta={week.newFollowers > 0 ? `+${week.newFollowers}` : null}
				/>
			</div>
			{missing && (
				<div className="flex items-center gap-3 border-b py-3 text-[13px]">
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
