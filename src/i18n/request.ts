import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/src/lib/locale";
import { getServerLocale } from "@/src/lib/locale.server";
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  let locale = DEFAULT_LOCALE;

  try {
    const session = await auth();

    if (session?.user?.id) {
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
      locale = await getServerLocale();
    }
  } catch (error) {
    console.error("Error detecting locale:", error);
    locale = await getServerLocale();
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
