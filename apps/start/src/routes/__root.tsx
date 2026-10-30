import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "../../../../components/ui/button";
import { PlatformRegistration } from "../components/platform-registration";
import { messages } from "../lib/messages";
import {
	PlatformTheme,
	themeBootstrap,
	usePlatformTheme,
} from "../lib/platform-theme";
import styles from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title: "Next Football Experience" },
			],
			links: [
				{ rel: "stylesheet", href: styles },
				{ rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
				{ rel: "manifest", href: "/manifest.webmanifest" },
				{ rel: "apple-touch-icon", href: "/icons/192.png" },
			],
		}),
		component: Outlet,
		shellComponent: Document,
		notFoundComponent: NotFound,
		errorComponent: RouteError,
	},
);
function RouteError() {
	const router = useRouter();
	return (
		<main className="p-8">
			<h1>
				{messages.fr.error} / {messages.en.error}
			</h1>
			<Button onClick={() => router.invalidate()}>
				{messages.fr.retry} / {messages.en.retry}
			</Button>
		</main>
	);
}
function Document({ children }: { children: ReactNode }) {
	const path = useRouterState({ select: (state) => state.location.pathname });
	return (
		<html lang={path.startsWith("/en") ? "en" : "fr"} suppressHydrationWarning>
			<head>
				<HeadContent />
				<script>{themeBootstrap}</script>
			</head>
			<body className="bg-background text-foreground">
				<PlatformTheme>
					<PlatformRegistration />
					{children}
				</PlatformTheme>
				<Scripts />
			</body>
		</html>
	);
}
function NotFound() {
	return (
		<main className="mx-auto max-w-4xl p-8">
			<h1>
				{messages.fr.missing} / {messages.en.missing}
			</h1>
			<Link to="/$locale" params={{ locale: "fr" }}>
				{messages.fr.home}
			</Link>
		</main>
	);
}
export function ThemeToggle({ label }: { label: string }) {
	const { toggle } = usePlatformTheme();
	return (
		<Button variant="outline" type="button" onClick={toggle}>
			{label}
		</Button>
	);
}
