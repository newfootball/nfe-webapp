import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
} from "@tanstack/react-router";
import { Button } from "../../../../components/ui/button";
import { authMessages } from "../lib/auth-messages";
import { publicEnv } from "../lib/env-public";
import { type Locale, messages } from "../lib/messages";
import { ThemeToggle } from "./__root";

export const Route = createFileRoute("/$locale")({
	beforeLoad: ({ params }) => {
		if (params.locale !== "fr" && params.locale !== "en") throw notFound();
		return { locale: params.locale as Locale };
	},
	component: Layout,
});
function Layout() {
	const { locale } = Route.useRouteContext();
	const t = messages[locale];
	return (
		<div className="mx-auto min-h-screen max-w-4xl px-6 py-8">
			<header className="flex flex-wrap items-center gap-6 border-b pb-6">
				<img src="/logo.svg" width="48" height="48" alt="" />
				<span className="font-bold">{publicEnv.VITE_APP_NAME}</span>
				<nav
					aria-label={
						locale === "fr" ? "Navigation principale" : "Main navigation"
					}
					className="flex flex-wrap gap-4"
				>
					<Button asChild variant="ghost">
						<Link to="/$locale" params={{ locale }}>
							{t.home}
						</Link>
					</Button>
					<Button asChild variant="ghost">
						<Link to="/$locale/about" params={{ locale }}>
							{t.about}
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link
							to="/$locale"
							params={{ locale: locale === "fr" ? "en" : "fr" }}
						>
							{locale === "fr" ? "English" : "Français"}
						</Link>
					</Button>
				</nav>
				<Link
					to="/$locale/sign-in"
					params={{ locale }}
					search={{ returnTo: "" }}
				>
					{authMessages[locale].signIn}
				</Link>
				<Link to="/$locale/private" params={{ locale }}>
					{authMessages[locale].private}
				</Link>
				<Link to="/$locale/messages" params={{ locale }}>
					Messages
				</Link>
				<ThemeToggle label={t.theme} />
			</header>
			<main className="py-16">
				<Outlet />
			</main>
		</div>
	);
}
