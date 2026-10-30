import { createFileRoute } from "@tanstack/react-router";
import { AboutUsPage } from "../components/public-pages/about-us";
import { publicPageContent } from "../lib/public-page-content";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/about-us")({
	loader: () => getPublicPageContext(),
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { locale, origin } = loaderData;
		const t = publicPageContent[locale]["about-us"];
		return publicHead(origin, "/about-us", locale, t.title, t.description);
	},
	component: Page,
});
function Page() {
	const { locale } = Route.useLoaderData();
	return (
		<main>
			<AboutUsPage locale={locale} />
		</main>
	);
}
