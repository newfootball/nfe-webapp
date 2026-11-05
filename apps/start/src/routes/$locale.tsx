import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
} from "@tanstack/react-router";
import { Icon } from "../components/home/icon";
import { Jersey } from "../components/home/jersey";
import { NotificationBell } from "../components/notification-bell";
import { authMessages } from "../lib/auth-messages";
import { publicEnv } from "../lib/env-public";
import { badgeOptions } from "../lib/home";
import { homeMessages } from "../lib/home-messages";
import { type Locale, messages } from "../lib/messages";
import { ThemeToggle } from "./__root";

export const Route = createFileRoute("/$locale")({
	beforeLoad: ({ params }) => {
		if (params.locale !== "fr" && params.locale !== "en") throw notFound();
		return { locale: params.locale as Locale };
	},
	component: Layout,
});
const navLink =
	"shrink-0 text-muted-foreground transition-colors hover:text-foreground";
const topLink = `${navLink} data-[status=active]:text-foreground`;
function ViewerJersey({ locale }: { locale: Locale }) {
	const query = useQuery(badgeOptions),
		badge = query.data;
	if (query.isPending) return <span className="size-[30px]" />;
	if (!badge)
		return (
			<Link
				to="/$locale/sign-in"
				params={{ locale }}
				search={{ returnTo: "" }}
				className="border-b border-foreground text-xs font-semibold"
			>
				{homeMessages[locale].signInShort}
			</Link>
		);
	return (
		<Link
			to="/$locale/profile"
			params={{ locale }}
			aria-label={homeMessages[locale].profile}
		>
			<Jersey
				number={badge.jerseyNumber}
				name={badge.name}
				image={badge.image}
				size={30}
				own
			/>
		</Link>
	);
}
const tab =
	"flex w-[62px] flex-col items-center gap-1 text-[10px] tracking-[0.01em] text-muted-foreground/70 data-[status=active]:font-medium data-[status=active]:text-foreground";
function BottomBar({ locale }: { locale: Locale }) {
	const t = homeMessages[locale];
	return (
		<nav
			aria-label={locale === "fr" ? "Navigation principale" : "Main navigation"}
			className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(68px+env(safe-area-inset-bottom))] items-start justify-around border-t border-hair bg-background/96 pt-2.5 backdrop-blur sm:hidden"
		>
			<Link
				to="/$locale"
				params={{ locale }}
				activeOptions={{ exact: true }}
				className={tab}
			>
				<Icon name="home" className="size-[22px]" />
				{t.home}
			</Link>
			<Link
				to="/$locale/explore"
				params={{ locale }}
				search={{ q: "", tab: "users" }}
				className={tab}
			>
				<Icon name="search" className="size-[22px]" />
				{t.search}
			</Link>
			<Link
				to="/$locale/publish"
				params={{ locale }}
				aria-label={t.publish}
				className="-mt-1 grid size-[46px] place-items-center rounded-[14px] bg-primary text-primary-foreground"
			>
				<Icon name="plus" className="size-[22px]" strokeWidth={1.6} />
			</Link>
			<Link to="/$locale/messages" params={{ locale }} className={tab}>
				<Icon name="comment" className="size-[22px]" />
				{t.messages}
			</Link>
			<Link to="/$locale/profile" params={{ locale }} className={tab}>
				<Icon name="user" className="size-[22px]" />
				{t.me}
			</Link>
		</nav>
	);
}
function Layout() {
	const { locale } = Route.useRouteContext();
	const t = messages[locale],
		h = homeMessages[locale];
	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-30 border-b border-hair bg-background/95 backdrop-blur">
				<div className="mx-auto flex h-[52px] max-w-4xl items-center gap-5 px-4 sm:px-6">
					<Link
						to="/$locale"
						params={{ locale }}
						activeOptions={{ exact: true }}
						aria-label={publicEnv.VITE_APP_NAME}
						className="flex items-center gap-[7px] font-display text-[21px] font-semibold tracking-[0.12em] uppercase"
					>
						<Icon name="ball" className="size-4 shrink-0" />
						NFE
					</Link>
					<nav
						aria-label={
							locale === "fr" ? "Navigation principale" : "Main navigation"
						}
						className="ml-4 hidden items-center gap-5 text-[13px] sm:flex"
					>
						<Link
							to="/$locale/explore"
							params={{ locale }}
							search={{ q: "", tab: "users" }}
							className={topLink}
						>
							{h.search}
						</Link>
						<Link
							to="/$locale/messages"
							params={{ locale }}
							className={topLink}
						>
							{h.messages}
						</Link>
					</nav>
					<div className="ml-auto flex items-center gap-4">
						<Link
							to="/$locale/publish"
							params={{ locale }}
							className="hidden items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground sm:inline-flex"
						>
							<Icon name="plus" className="size-4" strokeWidth={1.6} />
							{h.publish}
						</Link>
						<NotificationBell locale={locale} />
						<ViewerJersey locale={locale} />
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-4xl px-6 pt-6 pb-28 sm:py-8">
				<Outlet />
				<nav
					aria-label={
						locale === "fr" ? "Navigation secondaire" : "Secondary navigation"
					}
					className="mx-auto mt-10 flex max-w-xl flex-wrap items-center gap-x-5 gap-y-2 border-t border-hair pt-4 text-[11.5px]"
				>
					<Link to="/$locale/about" params={{ locale }} className={navLink}>
						{t.about}
					</Link>
					<Link to="/$locale/private" params={{ locale }} className={navLink}>
						{authMessages[locale].private}
					</Link>
					<Link
						to="/$locale"
						params={{ locale: locale === "fr" ? "en" : "fr" }}
						className={navLink}
					>
						{locale === "fr" ? "English" : "Français"}
					</Link>
					<ThemeToggle label={t.theme} className={navLink} />
				</nav>
			</main>
			<BottomBar locale={locale} />
		</div>
	);
}
