import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest): Promise<NextResponse> {
	const path = new URL(request.url).pathname;

	// Check admin routes
	if (path.startsWith("/admin")) {
		// Instead of directly using auth() which uses Prisma in Edge,
		// check for the session cookie and redirect if not present
		const sessionCookie =
			request.cookies.get("next-auth.session-token") ||
			request.cookies.get("__Secure-next-auth.session-token");

		if (!sessionCookie) {
			const signInUrl = new URL("/sign-in", request.url);
			signInUrl.searchParams.set("callbackUrl", path);
			return NextResponse.redirect(signInUrl);
		}

		// For role-based access, we'll let the page handle this check
		// since we can't safely decode the JWT in Edge without proper libraries
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/dashboard/:path*",
		"/profile/:path*",
		"/admin/:path*",
		"/((?!api|_next/static|_next/image|favicon.ico|manifest.json|workbox|sw|images).*)",
	],
};
