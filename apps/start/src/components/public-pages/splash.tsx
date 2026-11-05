import type { MouseEventHandler } from "react";
import { publicPageContent } from "../../lib/public-page-content";
import { Button } from "../ui/button";
import type { PublicPageProps } from "./layout";

/** Integration contract from app/splash/page.tsx; the host owns effects and cookies. */
export const legacySplashBehavior = {
	cookie: {
		name: "seen_splash",
		value: "true",
		maxAge: 60 * 60 * 24 * 365,
		path: "/",
		sameSite: "lax",
	},
	secure: "https-only",
	autoContinueAfterMs: 10000,
	imageRotationAfterMs: 3000,
	imageSources: [
		"https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=1920",
		"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=1920",
		"https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1920",
	],
} as const;

/**
 * Pure SSR view. onContinue must persist the legacy cookie before navigation.
 * The host may preventDefault for router navigation and invoke the same operation
 * after 10 seconds; this component never starts timers or touches browser APIs.
 * activeImage lets the host reproduce the legacy 3-second rotation, starting at 0.
 */
export function SplashPage({
	locale,
	onContinue,
	activeImage = 0,
	continueHref = "/",
}: PublicPageProps & {
	onContinue: MouseEventHandler<HTMLAnchorElement>;
	activeImage?: 0 | 1 | 2;
	continueHref?: string;
}) {
	const t = publicPageContent[locale].splash;
	return (
		<article
			lang={locale}
			className="overflow-hidden relative flex items-center justify-center min-h-svh px-5 py-16 bg-black text-white isolate"
		>
			<img
				src={legacySplashBehavior.imageSources[activeImage]}
				alt=""
				className="object-cover absolute inset-0 h-full w-full -z-20"
			/>
			<div aria-hidden="true" className="absolute inset-0 bg-black/75 -z-10" />
			<div className="flex flex-col items-center gap-6 max-w-3xl mx-auto text-center">
				<img src="/logo.svg" alt="" width={152} height={152} />
				<h1 className="font-oswald text-4xl font-bold leading-tight tracking-tight text-balance sm:text-6xl">
					{t.title}
				</h1>
				<p className="text-lg leading-relaxed text-white sm:text-xl">
					{t["new-way-to-experience-football"]}
				</p>
				<Button
					asChild
					size="lg"
					className="min-h-12 h-auto mt-3 py-3 whitespace-normal focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
				>
					<a href={continueHref} onClick={onContinue}>
						{t["get-started"]}
					</a>
				</Button>
			</div>
		</article>
	);
}
