import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  isSupportedLocale,
} from "./locale";

export async function getServerLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const headersList = await headers();

  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

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

  return DEFAULT_LOCALE;
}
