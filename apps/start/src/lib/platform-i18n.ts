import { IntlMessageFormat } from "intl-messageformat";
import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";
import type { Locale } from "./messages";

const dictionaries = { fr, en };
// Explicit locale/timezone keeps server and client formatting deterministic.
export function formatPlatformMessage(
	locale: Locale,
	message: string,
	values: Record<string, string | number | boolean | Date> = {},
) {
	return new IntlMessageFormat(message, locale, undefined, {
		formatters: {
			getNumberFormat: (language, options) =>
				new Intl.NumberFormat(language, options),
			getDateTimeFormat: (language, options) =>
				new Intl.DateTimeFormat(language, { timeZone: "UTC", ...options }),
			getPluralRules: (language, options) =>
				new Intl.PluralRules(language, options),
		},
	}).format(values);
}
export function translatePlatform(
	locale: Locale,
	key: string,
	values?: Record<string, string | number | boolean | Date>,
) {
	let message: unknown = dictionaries[locale];
	for (const segment of key.split(".")) {
		if (
			!message ||
			typeof message !== "object" ||
			!Object.hasOwn(message, segment)
		)
			throw new Error(`Unknown translation: ${key}`);
		message = (message as Record<string, unknown>)[segment];
	}
	if (typeof message !== "string") throw new Error(`Not a message: ${key}`);
	return formatPlatformMessage(locale, message, values);
}
