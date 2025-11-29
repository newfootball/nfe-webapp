import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Inter } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "./providers/react-query-provider";
const inter = Inter({ subsets: ["latin"] });

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nfe-foot.com";

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
		startupImage: "/logo.svg",
	},
	icons: {
		icon: "/logo.svg",
		shortcut: "/logo.svg",
		apple: "/logo.svg",
	},
	robots: {
		index: true,
		follow: true,
	},
	manifest: "/manifest.json",
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
		<html lang="en" className={cn(inter.className, "h-full")}>
			<body className="h-full">
				<NextIntlClientProvider>
					<ReactQueryProvider>
						{children}
					</ReactQueryProvider>
				</NextIntlClientProvider>
				<Analytics />
				<SpeedInsights />
				<GoogleAnalytics gaId={env.GOOGLE_ANALYTICS_ID ?? ""} />
			</body>
		</html>
	);
}
