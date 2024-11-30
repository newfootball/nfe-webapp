import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Inter } from "next/font/google";
import "./globals.css";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Next Football Experience",
	description: "Next Football Experience - Football Social Media",
	keywords: ["football", "social media", "experience", "social"],
	icons: {
		icon: "/logo.svg",
	},
	robots: {
		index: true,
		follow: true,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={cn(inter.className)}>
			<body>
				<SessionProvider>{children}</SessionProvider>
				<Analytics />
				<SpeedInsights />
				<GoogleAnalytics gaId={env.GOOGLE_ANALYTICS_ID} />
			</body>
		</html>
	);
}
