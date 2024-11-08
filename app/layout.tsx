import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Inter } from "next/font/google";
import { Footer } from "./footer";
import "./globals.css";
import { Header } from "./header";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Next Football Experience",
  description: "Next Football Experience - Football Social Media",
  keywords: ["football", "social media", "experience", "social"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn(inter.className)}>
        <SessionProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <Toaster
            expand={false}
            position="top-right"
            closeButton
            richColors
            duration={2000}
          />
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
        <GoogleAnalytics gaId={env.GOOGLE_ANALYTICS_ID} />
      </body>
    </html>
  );
}
