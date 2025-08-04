import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  isSupportedLocale,
} from "./locale";

export async function getServerLocale(): Promise<SupportedLocale> {
  try {
    const headersList = await headers();
    const acceptLanguage = headersList.get("accept-language");
    if (acceptLanguage) {
      const preferredLocales = acceptLanguage
        .split(",")
        .map((lang) => {
          const langPart = lang.split(";")[0]?.trim();
          return langPart ? langPart.split("-")[0]?.toLowerCase() : null;
        })
        .filter((locale): locale is string => Boolean(locale));

      for (const locale of preferredLocales) {
        if (isSupportedLocale(locale)) {
          return locale;
        }
      }
    }
  } catch {
    // During static generation, headers are not available
    // Fall back to default locale
  }

  return DEFAULT_LOCALE;
}
