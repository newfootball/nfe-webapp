"use client";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/src/lib/locale";
import { useEffect } from "react";

export const useAuthLanguage = () => {
  useEffect(() => {
    // Synchroniser localStorage avec les cookies lors du chargement des pages d'auth
    const savedLocale = localStorage.getItem("language");

    if (
      savedLocale &&
      SUPPORTED_LOCALES.includes(savedLocale as SupportedLocale)
    ) {
      // Définir le cookie de session pour que le serveur puisse l'utiliser
      document.cookie = `NEXT_LOCALE=${savedLocale}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);
};
