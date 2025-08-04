import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/src/lib/locale";
import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "never",
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|workbox|sw|images).*)",
  ],
};
