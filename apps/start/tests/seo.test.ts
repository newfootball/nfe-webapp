import { expect, test } from "bun:test";
import { publicHead } from "../src/lib/seo";

const origin = "https://nfe-foot.com";

test("localized pages declare canonical, hreflang alternates and x-default", () => {
	const head = publicHead(origin, "/fr/post/abc", "fr", "T", "D");
	expect(head.links).toEqual([
		{ rel: "canonical", href: `${origin}/fr/post/abc` },
		{ rel: "alternate", hrefLang: "fr", href: `${origin}/fr/post/abc` },
		{ rel: "alternate", hrefLang: "en", href: `${origin}/en/post/abc` },
		{ rel: "alternate", hrefLang: "x-default", href: `${origin}/post/abc` },
	]);
	const home = publicHead(origin, "/en", "en", "T", "D");
	expect(home.links.at(-1)).toEqual({
		rel: "alternate",
		hrefLang: "x-default",
		href: `${origin}/`,
	});
});

test("unprefixed pages keep only their canonical and an existing og:image", () => {
	const head = publicHead(origin, "/players", "fr", "T", "D");
	expect(head.links).toEqual([{ rel: "canonical", href: `${origin}/players` }]);
	expect(head.meta).toContainEqual({
		property: "og:image",
		content: `${origin}/icons/512.png`,
	});
});
