import { type SessionUser, auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function middleware(request: Request): Promise<NextResponse> {
	const path = new URL(request.url).pathname;

	// Check admin routes
	if (path.startsWith("/admin")) {
		const session = await auth();

		if (!session?.user) {
			const signInUrl = new URL("/sign-in", request.url);
			signInUrl.searchParams.set("callbackUrl", path);
			return NextResponse.redirect(signInUrl);
		}

		const user = session.user as SessionUser;

		if (user.role !== "ADMIN") {
			return NextResponse.redirect(new URL("/", request.url));
		}
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
