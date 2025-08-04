export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  fr: "Français",
};

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function detectBrowserLocale(): SupportedLocale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const browserLocales = navigator.languages || [navigator.language];

  for (const locale of browserLocales) {
    const normalizedLocale = locale.split("-")[0]?.toLowerCase();
    if (normalizedLocale && isSupportedLocale(normalizedLocale)) {
      return normalizedLocale;
    }
  }

  return DEFAULT_LOCALE;
}

export function setLocaleCookie(locale: SupportedLocale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}
