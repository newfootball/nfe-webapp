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
				content: new URL("/icons/512.png", origin).href,
			},
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		],
		links: [{ rel: "canonical", href: url }, ...alternates(origin, path)],
	};
}

function alternates(origin: string, path: string) {
	const match = path.match(/^\/(fr|en)(\/.*)?$/);
	if (!match) return [];
	const rest = match[2] ?? "";
	return [
		...(["fr", "en"] as const).map((hreflang) => ({
			rel: "alternate",
			hrefLang: hreflang,
			href: new URL(`/${hreflang}${rest}`, origin).href,
		})),
		{
			rel: "alternate",
			hrefLang: "x-default",
			href: new URL(rest || "/", origin).href,
		},
	];
}

export const siteSeo = {
	fr: {
		home: {
			title: "Le football amateur en vidéo",
			description:
				"Joueurs, coachs, recruteurs et clubs partagent leurs vidéos de football sur NFE.",
		},
		explore: {
			title: "Explorer",
			description:
				"Recherche des joueurs, des coachs, des clubs et des vidéos de football sur NFE.",
		},
	},
	en: {
		home: {
			title: "Grassroots football on video",
			description:
				"Players, coaches, scouts and clubs share their football videos on NFE.",
		},
		explore: {
			title: "Explore",
			description: "Search football players, coaches, clubs and videos on NFE.",
		},
	},
} as const;
