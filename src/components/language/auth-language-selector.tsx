"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/src/lib/locale";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export const AuthLanguageSelector = () => {
  const t = useTranslations("common");
  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>("en");

  useEffect(() => {
    const savedLocale = localStorage.getItem("language");
    if (
      savedLocale &&
      SUPPORTED_LOCALES.includes(savedLocale as SupportedLocale)
    ) {
      setCurrentLocale(savedLocale as SupportedLocale);
    }
  }, []);

  const handleLanguageChange = (newLocale: SupportedLocale) => {
    setCurrentLocale(newLocale);
    localStorage.setItem("language", newLocale);

    // Synchroniser avec les cookies
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

    // Recharger la page pour appliquer le changement de langue
    window.location.reload();
  };

  return (
    <Select value={currentLocale} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-auto min-w-[140px]">
        <SelectValue placeholder={t("select-language")} />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem key={locale} value={locale}>
            <span className="mr-2">{locale === "en" ? "🇺🇸" : "🇫🇷"}</span>
            {LOCALE_LABELS[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
