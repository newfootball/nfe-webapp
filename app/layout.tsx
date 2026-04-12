import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import "./globals.css";
import { ReactQueryProvider } from "./providers/react-query-provider";

const inter = Inter({ subsets: ["latin"] });

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nfe-foot.com";

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	minimumScale: 1,
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#FACC15" },
		{ media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
	],
};

export const metadata: Metadata = {
	metadataBase: new URL(baseUrl),
	applicationName: "Next Football Experience",
	title: {
		template: "%s | Next Football Experience",
		default: "Next Football Experience",
	},
	description: "Next Football Experience - Football Social Media",
	keywords: [
		"football",
		"social media",
		"experience",
		"social",
		"amateur",
		"video",
	],
	openGraph: {
		title: "Next Football Experience",
		description: "Next Football Experience - Football Social Media",
		url: "https://nfe-foot.com",
		siteName: "Next Football Experience",
		locale: "fr_FR",
		type: "website",
		images: [
			{
				url: "/logo.svg",
				width: 1200,
				height: 630,
			},
		],
	},
	authors: [
		{
			name: "Fahari.pro",
			url: "https://fahari.pro",
		},
	],
	appleWebApp: {
		capable: true,
		title: "Next Football Experience",
		statusBarStyle: "black-translucent",
		startupImage: [
			{
				url: "/icons/512.png",
				media:
					"(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
			},
		],
	},
	icons: {
		icon: [
			{ url: "/icons/96.png", sizes: "96x96", type: "image/png" },
			{ url: "/icons/192.png", sizes: "192x192", type: "image/png" },
			{ url: "/icons/512.png", sizes: "512x512", type: "image/png" },
		],
		shortcut: "/icons/96.png",
		apple: [
			{ url: "/icons/144.png", sizes: "144x144", type: "image/png" },
			{ url: "/icons/192.png", sizes: "192x192", type: "image/png" },
		],
	},
	robots: {
		index: true,
		follow: true,
	},
	manifest: "/manifest.webmanifest",
	formatDetection: {
		telephone: false,
	},
	twitter: {
		card: "summary_large_image",
		site: "@nfe_foot",
		creator: "@nfe_foot",
		title: {
			template: "%s | Next Football Experience",
			default: "Next Football Experience",
		},
		description: "Next Football Experience - Football Social Media",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="fr" className={cn(inter.className, "h-full")}>
			<body className="h-full">
				<NextIntlClientProvider>
					<ReactQueryProvider>{children}</ReactQueryProvider>
				</NextIntlClientProvider>
				<Analytics />
				<SpeedInsights />
				<GoogleAnalytics gaId={env.GOOGLE_ANALYTICS_ID ?? ""} />
			</body>
		</html>
	);
}
