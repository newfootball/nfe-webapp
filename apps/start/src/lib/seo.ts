import type { Locale } from "./messages";

export function publicHead(
	origin: string,
	path: string,
	locale: Locale,
	title: string,
	description: string,
) {
	const url = new URL(path, origin).href;
	return {
		meta: [
			{ title: `${title} | NFE` },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: url },
			{ property: "og:locale", content: locale === "fr" ? "fr_FR" : "en_GB" },
			{
				property: "og:image",
				content: new URL("/images/logo/logo-color.png", origin).href,
			},
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		],
		links: [{ rel: "canonical", href: url }],
	};
}
