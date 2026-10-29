import "@tanstack/react-start/server-only";
import {
	getCookie,
	getRequest,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";
import {
	AuthFailure,
	boundary,
	identity,
	mutation,
	privateResponse,
} from "./auth-context.server";
import { detectLocale, type ProfileLocale, validLocale } from "./locale-policy";
import type { Validated } from "./profile-input";
export async function readLocale() {
	privateResponse();
	setResponseHeader("Vary", "Cookie, Accept-Language");
	const cookie = getCookie("NEXT_LOCALE");
	if (validLocale(cookie)) return cookie;
	// Only session API reads; no broad key and no prefs become authority.
	try {
		const { user } = await identity();
		if (validLocale(user.prefs.nfeLocale)) return user.prefs.nfeLocale;
	} catch {}
	return detectLocale(null, getRequest().headers.get("accept-language"));
}
export function storeLocale(input: Validated<{ locale: ProfileLocale }>) {
	return boundary(async () => {
		const config = mutation();
		if (!input.valid) throw new AuthFailure("invalid");
		try {
			const { account, user } = await identity();
			await account.updatePrefs({
				prefs: { ...user.prefs, nfeLocale: input.data.locale },
			});
		} catch (e) {
			if (!(e instanceof AuthFailure && e.reason === "unauthorized")) throw e;
		}
		setCookie("NEXT_LOCALE", input.data.locale, {
			path: "/",
			sameSite: "lax",
			secure: config.cookie.options.secure,
			maxAge: 31536000,
		});
		return { locale: input.data.locale };
	});
}
