import { expect, test } from "bun:test";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { detectLocale } from "../src/lib/locale-policy";
import {
	formatPlatformMessage,
	translatePlatform,
} from "../src/lib/platform-i18n";

test("cookie wins; language quality, regions, invalid and zero weights are bounded", () => {
	expect(detectLocale("fr", "en-US,en;q=0.8")).toBe("fr");
	expect(detectLocale("en", "fr")).toBe("en");
	expect(detectLocale("es", "de, en-GB;q=0.9, fr;q=0.8")).toBe("en");
	expect(detectLocale(null, "en;q=0,fr;q=0.1")).toBe("fr");
	expect(detectLocale(null, "en;q=2,fr;q=bogus,*")).toBe("fr");
	expect(detectLocale(null, "en;q=.8,fr;q=.8")).toBe("en");
	expect(detectLocale(null, null)).toBe("fr");
});
function flatten(object: unknown, prefix = ""): Record<string, string> {
	return Object.fromEntries(
		Object.entries(object as Record<string, unknown>).flatMap(([key, value]) =>
			typeof value === "string"
				? [[`${prefix}${key}`, value]]
				: Object.entries(flatten(value, `${prefix}${key}.`)),
		),
	);
}
test("all preserved FR/EN dictionary keys and ICU messages format independently of Next", () => {
	const dictionaries = { fr: flatten(fr), en: flatten(en) };
	expect(Object.keys(dictionaries.fr).sort()).toEqual(
		Object.keys(dictionaries.en).sort(),
	);
	for (const locale of ["fr", "en"] as const) {
		for (const [key, message] of Object.entries(dictionaries[locale])) {
			if (message.includes(", plural,")) {
				for (const count of [0, 1, 2, 1000]) {
					const result = translatePlatform(locale, key, { count });
					expect(typeof result).toBe("string");
					expect(result).not.toContain("{count");
				}
			}
		}
	}
	expect(
		formatPlatformMessage(
			"fr",
			"{count, plural, =0 {Aucun} one {# but} other {# buts}}",
			{ count: 2 },
		),
	).toBe("2 buts");
	expect(
		formatPlatformMessage(
			"en",
			"{role, select, coach {Coach} other {Player}}: {value, number}",
			{ role: "coach", value: 1234 },
		),
	).toBe("Coach: 1,234");
	expect(() => translatePlatform("en", "__proto__.x")).toThrow();
	expect(() => formatPlatformMessage("en", "Hello {name}")).toThrow();
});

test("preserved ICU exact-zero, singular, plural and interpolation outputs", () => {
	expect(
		translatePlatform("fr", "posts.post-actions.comments-count", { count: 0 }),
	).toBe("Aucun commentaire");
	expect(
		translatePlatform("en", "posts.post-actions.comments-count", { count: 0 }),
	).toBe("No comments");
	expect(
		translatePlatform("fr", "posts.post-actions.likes-count", { count: 2 }),
	).toBe("2 j'aime");
	expect(
		translatePlatform("en", "posts.post-actions.likes-count", { count: 1 }),
	).toBe("1 like");
	expect(
		translatePlatform("en", "posts.post-actions.likes-count", { count: 2 }),
	).toBe("2 likes");
	expect(
		translatePlatform("fr", "explore.no-results", { query: "Équipe" }),
	).toBe("Aucun résultat pour « Équipe »");
	expect(
		formatPlatformMessage("en", "{when, date, ::yyyyMMdd}", {
			when: new Date("2026-10-30T00:30:00Z"),
		}),
	).toBe("10/30/2026");
});
