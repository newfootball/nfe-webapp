import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function middleware(request: Request) {
	// Liste des chemins protégés
	const protectedPaths = ["/dashboard", "/profile"]; // Ajoutez vos chemins protégés
	const path = new URL(request.url).pathname;

	if (protectedPaths.some((protectedPath) => path.startsWith(protectedPath))) {
		const session = await auth();

		console.log({ session });

		if (!session || !session?.user) {
			// Redirection vers la page de connexion avec le retour prévu
			const signInUrl = new URL("/sign-in", request.url);
			signInUrl.searchParams.set("callbackUrl", path);

			return NextResponse.redirect(signInUrl);
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/dashboard/:path*",
		"/profile/:path*",
		// Ajoutez d'autres chemins protégés ici
	],
};
