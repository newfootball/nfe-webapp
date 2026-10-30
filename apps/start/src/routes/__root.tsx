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
import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Button } from "../../../../components/ui/button";
import { messages } from "../lib/messages";
import styles from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title: "Next Football Experience" },
				{ name: "robots", content: "noindex, nofollow" },
			],
			links: [
				{ rel: "stylesheet", href: styles },
				{ rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
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
	const { path, locale } = useRouterState({
		select: (state) => ({
			path: state.location.pathname,
			locale: state.matches
				.map(
					(match) =>
						(match.loaderData as { locale?: string } | undefined)?.locale,
				)
				.find(Boolean),
		}),
	});
	return (
		<html
			lang={locale ?? (path.startsWith("/en") ? "en" : "fr")}
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
			</head>
			<body className="bg-background text-foreground">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
					{children}
				</ThemeProvider>
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
	const { resolvedTheme, setTheme } = useTheme();
	return (
		<Button
			variant="outline"
			type="button"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
		>
			{label}
		</Button>
	);
}
