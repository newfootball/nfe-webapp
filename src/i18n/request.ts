import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

function detectLocaleFromAcceptLanguage(acceptLanguage: string): Locale {
	const candidates = acceptLanguage
		.split(",")
		.map((part) => {
			const [tag, q] = part.split(";");
			const lang = tag?.trim().toLowerCase().split("-")[0] ?? "";
			const quality = q ? Number.parseFloat(q.replace(/.*q=/i, "")) : 1;
			return { lang, quality: Number.isNaN(quality) ? 1 : quality };
		})
		.filter(({ lang }) => lang && lang !== "*")
		.sort((a, b) => b.quality - a.quality);

	for (const { lang } of candidates) {
		if (locales.includes(lang as Locale)) return lang as Locale;
	}
	return defaultLocale;
}

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;

	let locale: Locale;
	if (localeCookie && locales.includes(localeCookie as Locale)) {
		locale = localeCookie as Locale;
	} else {
		const headerStore = await headers();
		const acceptLanguage = headerStore.get("accept-language") ?? "";
		locale = detectLocaleFromAcceptLanguage(acceptLanguage);
	}

	return {
		locale,
		messages: (await import(`../../messages/${locale}.json`)).default,
	};
});
