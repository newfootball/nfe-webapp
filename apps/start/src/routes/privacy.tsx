import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "../components/public-pages/privacy";
import { publicPageContent } from "../lib/public-page-content";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/privacy")({
	loader: () => getPublicPageContext(),
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { locale, origin } = loaderData;
		const t = publicPageContent[locale]["privacy"];
		return publicHead(origin, "/privacy", locale, t.title, t.intro);
	},
	component: Page,
});
function Page() {
	const { locale } = Route.useLoaderData();
	return (
		<main>
			<PrivacyPage locale={locale} />
		</main>
	);
}
