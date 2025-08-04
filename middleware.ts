import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(_request: NextRequest): Promise<NextResponse> {
	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|workbox|sw|images).*)",
	],
};
