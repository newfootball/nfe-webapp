// Traefik terminates TLS and forwards plain HTTP. Start builds absolute URLs,
// secure cookies and OAuth callbacks from `request.url`, so the public scheme and
// host are restored from the forwarded headers when the proxy is trusted.
const hostPattern = /^[a-z0-9.-]+(?::\d{1,5})?$/i;
const first = (value: string | null) => value?.split(",")[0]?.trim() ?? "";

export function publicRequestUrl(request: Request, trustProxy: boolean) {
	const url = new URL(request.url);
	if (!trustProxy) return url;
	const proto = first(request.headers.get("x-forwarded-proto")).toLowerCase();
	if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
	const host = first(request.headers.get("x-forwarded-host"));
	if (host && hostPattern.test(host)) {
		url.port = "";
		url.host = host;
	}
	return url;
}

// Sessions use a __Host- cookie bound to the canonical origin: alias hosts
// (www) redirect there before any application logic runs.
export function canonicalRedirect(url: URL, canonical: URL, method: string) {
	if (url.host === canonical.host) return;
	if (method !== "GET" && method !== "HEAD")
		return new Response("Misdirected Request", { status: 421 });
	return Response.redirect(
		`${canonical.origin}${url.pathname}${url.search}`,
		308,
	);
}
