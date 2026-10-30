import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "../components/public-pages/terms";
import { publicPageContent } from "../lib/public-page-content";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/terms")({
	loader: () => getPublicPageContext(),
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { locale, origin } = loaderData;
		const t = publicPageContent[locale]["terms"];
		return publicHead(origin, "/terms", locale, t.title, t["section-1"]);
	},
	component: Page,
});
function Page() {
	const { locale } = Route.useLoaderData();
	return (
		<main>
			<TermsPage locale={locale} />
		</main>
	);
}
