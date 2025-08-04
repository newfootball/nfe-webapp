import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/src/lib/locale";
import { getServerLocale } from "@/src/lib/locale.server";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  let locale = DEFAULT_LOCALE;

  try {
    const session = await auth();

    if (session?.user?.id) {
      // Pour les utilisateurs connectés, utiliser la langue de la base de données
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { language: true },
      });

      if (user?.language && isSupportedLocale(user.language)) {
        locale = user.language;
      } else {
        locale = await getServerLocale();
      }
    } else {
      // Pour les utilisateurs non connectés, vérifier d'abord le cookie de session
      const cookieStore = await cookies();
      const sessionLocale = cookieStore.get("NEXT_LOCALE")?.value;

      if (sessionLocale && isSupportedLocale(sessionLocale)) {
        locale = sessionLocale;
      } else {
        locale = await getServerLocale();
      }
    }
  } catch {
    // During static generation, auth() and database access may not be available
    // Fall back to server locale detection or default
    try {
      locale = await getServerLocale();
    } catch {
      locale = DEFAULT_LOCALE;
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
