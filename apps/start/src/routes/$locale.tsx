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
	"shrink-0 py-2.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:shadow-[inset_0_-1px_0_var(--foreground)]";
function ViewerJersey({ locale }: { locale: Locale }) {
	const badge = useQuery(badgeOptions).data;
	if (!badge) return null;
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
function Layout() {
	const { locale } = Route.useRouteContext();
	const t = messages[locale];
	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-30 border-b border-hair bg-background/95 backdrop-blur">
				<div className="mx-auto flex h-[52px] max-w-4xl items-center gap-4 px-4 sm:px-6">
					<Link
						to="/$locale"
						params={{ locale }}
						activeOptions={{ exact: true }}
						className="flex min-w-0 items-center gap-2 font-display text-[17px] font-medium tracking-[0.1em] whitespace-nowrap uppercase"
					>
						<Icon name="ball" className="size-4 shrink-0" />
						<span className="truncate">{publicEnv.VITE_APP_NAME}</span>
					</Link>
					<div className="ml-auto flex items-center gap-4">
						<NotificationBell locale={locale} />
						<ViewerJersey locale={locale} />
					</div>
				</div>
				<nav
					aria-label={
						locale === "fr" ? "Navigation principale" : "Main navigation"
					}
					className="scrollbar-none mx-auto flex max-w-4xl items-center gap-5 overflow-x-auto px-4 text-[12.5px] sm:px-6"
				>
					<Link
						to="/$locale"
						params={{ locale }}
						activeOptions={{ exact: true }}
						className={navLink}
					>
						{t.home}
					</Link>
					<Link to="/$locale/about" params={{ locale }} className={navLink}>
						{t.about}
					</Link>
					<Link to="/$locale/messages" params={{ locale }} className={navLink}>
						Messages
					</Link>
					<Link to="/$locale/private" params={{ locale }} className={navLink}>
						{authMessages[locale].private}
					</Link>
					<Link
						to="/$locale/sign-in"
						params={{ locale }}
						search={{ returnTo: "" }}
						className={navLink}
					>
						{authMessages[locale].signIn}
					</Link>
					<span className="ml-auto flex shrink-0 items-center gap-4">
						<Link
							to="/$locale"
							params={{ locale: locale === "fr" ? "en" : "fr" }}
							className={navLink}
						>
							{locale === "fr" ? "English" : "Français"}
						</Link>
						<ThemeToggle label={t.theme} className={navLink} />
					</span>
				</nav>
			</header>
			<main className="mx-auto max-w-4xl px-6 py-8">
				<Outlet />
			</main>
		</div>
	);
}
