import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "../components/public-pages/contact";
import { publicPageContent } from "../lib/public-page-content";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/contact")({
	loader: () => getPublicPageContext(),
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { locale, origin } = loaderData;
		const t = publicPageContent[locale]["contact"];
		return publicHead(origin, "/contact", locale, t.title, t.description);
	},
	component: Page,
});
function Page() {
	const { locale } = Route.useLoaderData();
	return (
		<main>
			<ContactPage locale={locale} />
		</main>
	);
}
