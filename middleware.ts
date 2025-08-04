import { NextResponse } from "next/server";

export async function middleware(): Promise<NextResponse> {
  // Allow next-intl to handle locale detection through request configuration
  // The actual locale detection is handled in src/i18n/request.ts
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|workbox|sw|images).*)",
  ],
};
