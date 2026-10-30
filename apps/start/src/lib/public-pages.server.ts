import "@tanstack/react-start/server-only";
import {
	getRequest,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";
import { readLocale } from "./locale.server";

// No production indexability is enabled by this migration lot. The permanent
// host/withdrawal gates must be accepted before changing this policy.
export async function publicPageContext() {
	setResponseHeader("Cache-Control", "private, no-store");
	setResponseHeader("Vary", "Cookie, Accept-Language");
	setResponseHeader("X-Robots-Tag", "noindex, nofollow");
	return {
		locale: await readLocale(),
		origin: new URL(getRequest().url).origin,
	};
}
export function continueSplash(request: Request) {
	setCookie("seen_splash", "true", {
		path: "/",
		maxAge: 31536000,
		sameSite: "lax",
		secure: new URL(request.url).protocol === "https:",
	});
	return new Response(null, {
		status: 303,
		headers: { Location: "/", "Cache-Control": "private, no-store" },
	});
}
