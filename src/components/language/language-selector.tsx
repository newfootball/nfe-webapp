"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setGuestLanguage,
  updateUserLanguage,
} from "@/src/actions/language.action";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/src/lib/locale";
import { Languages } from "lucide-react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LanguageSelector() {
  const { data: session } = useSession();
  const locale = useLocale() as SupportedLocale;
  const router = useRouter();
  const t = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  const handleLanguageChange = async (newLocale: SupportedLocale) => {
    if (newLocale === locale || isLoading) return;

    setIsLoading(true);

    try {
      const result = session?.user?.id
        ? await updateUserLanguage(newLocale)
        : await setGuestLanguage(newLocale);

      if (result.success) {
        startTransition(() => {
          router.refresh();
        });
      } else {
        console.error("Failed to update language:", result.error);
      }
    } catch (error) {
      console.error("Error changing language:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          disabled={isPending || isLoading}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t("change-language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((supportedLocale) => (
          <DropdownMenuItem
            key={supportedLocale}
            onClick={() => handleLanguageChange(supportedLocale)}
            className={`cursor-pointer ${
              locale === supportedLocale ? "bg-accent" : ""
            }`}
            disabled={locale === supportedLocale || isPending || isLoading}
          >
            <span className="mr-2">
              {supportedLocale === "en" ? "🇺🇸" : "🇫🇷"}
            </span>
            {LOCALE_LABELS[supportedLocale]}
            {locale === supportedLocale && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
