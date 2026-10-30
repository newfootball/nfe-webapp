import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	legacySplashBehavior,
	SplashPage,
} from "../components/public-pages/splash";
import { publicPageContent } from "../lib/public-page-content";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/splash")({
	loader: () => getPublicPageContext(),
	head: ({ loaderData }) =>
		loaderData
			? publicHead(
					loaderData.origin,
					"/splash",
					loaderData.locale,
					publicPageContent[loaderData.locale].splash.title,
					publicPageContent[loaderData.locale].splash[
						"new-way-to-experience-football"
					],
				)
			: {},
	component: Page,
});
function Page() {
	const { locale } = Route.useLoaderData();
	const [activeImage, setActiveImage] = useState<0 | 1 | 2>(0);
	useEffect(() => {
		const timeout = setTimeout(
			() => window.location.assign("/splash/continue"),
			legacySplashBehavior.autoContinueAfterMs,
		);
		const interval = setInterval(
			() => setActiveImage((i) => ((i + 1) % 3) as 0 | 1 | 2),
			legacySplashBehavior.imageRotationAfterMs,
		);
		return () => {
			clearTimeout(timeout);
			clearInterval(interval);
		};
	}, []);
	return (
		<main>
			<SplashPage
				locale={locale}
				activeImage={activeImage}
				onContinue={() => {}}
				continueHref="/splash/continue"
			/>
		</main>
	);
}
