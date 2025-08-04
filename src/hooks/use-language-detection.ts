"use client";

import { setGuestLanguage } from "@/src/actions/language.action";
import { DEFAULT_LOCALE, detectBrowserLocale } from "@/src/lib/locale";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

export function useLanguageDetection() {
  const { data: session, status } = useSession();
  const currentLocale = useLocale();
  const [hasDetected, setHasDetected] = useState(false);

  useEffect(() => {
    if (status === "loading" || hasDetected) return;

    const detectAndSetLanguage = async () => {
      if (!session?.user) {
        const browserLocale = detectBrowserLocale();

        if (
          browserLocale !== currentLocale &&
          browserLocale !== DEFAULT_LOCALE
        ) {
          try {
            await setGuestLanguage(browserLocale);
            window.location.reload();
          } catch (error) {
            console.error("Failed to set browser language:", error);
          }
        }
      }

      setHasDetected(true);
    };

    const timer = setTimeout(detectAndSetLanguage, 100);
    return () => clearTimeout(timer);
  }, [session, status, currentLocale, hasDetected]);

  return { hasDetected };
}
