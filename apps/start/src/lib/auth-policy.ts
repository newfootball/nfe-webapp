export function safeReturnPath(value: unknown, locale: "fr" | "en") {
	const allowed = [
		"post/my",
		"private",
		"onboarding",
		"profile",
		"profile/edit-user",
		"profile/account-security",
	].map((path) => `/${locale}/${path}`);
	const ownEdit =
		typeof value === "string" &&
		new RegExp(`^/${locale}/post/[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}/edit$`).test(
			value,
		);
	return typeof value === "string" && (allowed.includes(value) || ownEdit)
		? value
		: `/${locale}/private`;
}

export function isTrustedMutation(request: Request, origin: string) {
	return (
		request.method === "POST" &&
		request.headers.get("origin") === origin &&
		!["cross-site", "same-site"].includes(
			request.headers.get("sec-fetch-site") ?? "",
		)
	);
}

export function sessionCookiePolicy(origin: string, allowLoopback: boolean) {
	const url = new URL(origin);
	const secure = url.protocol === "https:";
	if (
		!secure &&
		!(
			allowLoopback &&
			url.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
		)
	) {
		throw new Error("HTTPS required");
	}
	if (url.origin !== origin || url.username || url.password)
		throw new Error("Invalid origin");
	return {
		name: secure ? "__Host-nfe-session" : "nfe-session-dev",
		options: { httpOnly: true, secure, sameSite: "lax" as const, path: "/" },
	};
}
