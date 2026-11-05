import { expect, test } from "bun:test";
import {
	assetPaths,
	chunkImports,
	describeSignedUrl,
	leakedNames,
	mediaPathFrom,
	runSmoke,
} from "../scripts/production-smoke";

const origin = "https://nfe-foot.example";
const signed =
	"https://s3.eu-central-003.backblazeb2.com/b/media/a/b?X-Amz-Credential=SECRETCRED&X-Amz-Expires=120&X-Amz-Signature=SECRETSIG&response-cache-control=private%2C%20no-store&versionId=4_z";
const html = `<html lang="fr"><link href="/assets/app-AbCdEf12.css"><script src="/assets/index-AbCdEf12.js"></script><img src="/post-media/p1/thumbnail"></html>`;

test("parsers extract assets, lazy chunks and public media", () => {
	expect(assetPaths(html)).toEqual([
		"/assets/app-AbCdEf12.css",
		"/assets/index-AbCdEf12.js",
	]);
	expect(
		chunkImports(`import("./feed-Zx9Yw8Vu.js");import"/assets/x-Qw3Er4Ty.js"`),
	).toEqual(["/assets/feed-Zx9Yw8Vu.js", "/assets/x-Qw3Er4Ty.js"]);
	expect(mediaPathFrom(html)).toBe("/post-media/p1/thumbnail");
	expect(leakedNames("x B2_APPLICATION_KEY y")).toContain("B2_APPLICATION_KEY");
});

test("signed URL description never carries the credential or signature", () => {
	const described = describeSignedUrl(signed);
	expect(described).toEqual({
		host: "s3.eu-central-003.backblazeb2.com",
		expires: 120,
		signed: true,
		pinned: true,
		noStore: true,
	});
	expect(JSON.stringify(described)).not.toContain("SECRET");
});

function fakeDeployment(
	overrides: Record<string, () => Response> = {},
): typeof fetch {
	const routes: Record<string, () => Response> = {
		"GET /healthz": () => Response.json({ status: "ok" }),
		"GET /readyz": () =>
			Response.json({ status: "ok", checks: { appwrite: "ok" } }),
		"GET /fr": () => new Response(html),
		"GET /assets/app-AbCdEf12.css": () => immutable(""),
		"GET /assets/index-AbCdEf12.js": () => immutable(""),
		"POST /_diag/client-error": () => new Response(null, { status: 403 }),
		"GET /post-media/p1/thumbnail": () =>
			new Response(null, {
				status: 307,
				headers: {
					location: signed,
					"cache-control": "private, no-store",
					"referrer-policy": "no-referrer",
				},
			}),
		...overrides,
	};
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		if (url.host.startsWith("www."))
			return new Response(null, {
				status: 308,
				headers: { location: `${origin}${url.pathname}${url.search}` },
			});
		if (url.host.includes("backblazeb2")) {
			const requestOrigin = new Headers(init?.headers).get("origin");
			if (method === "OPTIONS")
				return requestOrigin === origin
					? new Response(null, {
							headers: {
								"access-control-allow-origin": origin,
								"access-control-allow-methods": "GET, PUT",
							},
						})
					: new Response(null, { status: 403 });
			return new Response(new Uint8Array(1024), {
				status: 206,
				headers: { "content-range": "bytes 0-1023/5000" },
			});
		}
		return (
			routes[`${method} ${url.pathname}`] ??
			(() => new Response("nf", { status: 404 }))
		)();
	}) as typeof fetch;
}
const immutable = (body: string) =>
	new Response(body, {
		headers: { "cache-control": "public, max-age=31536000, immutable" },
	});

test("a healthy deployment passes every check", async () => {
	const results = await runSmoke(origin, { fetch: fakeDeployment() });
	expect(results.filter((r) => r.status !== "pass")).toEqual([]);
	expect(results).toHaveLength(12);
	expect(JSON.stringify(results)).not.toContain("SECRET");
});

test("a leaked server name, unready Appwrite or open diagnostics fail the smoke", async () => {
	const results = await runSmoke(origin, {
		fetch: fakeDeployment({
			"GET /readyz": () =>
				Response.json({ checks: { appwrite: "unavailable" } }, { status: 503 }),
			"GET /assets/index-AbCdEf12.js": () =>
				immutable("x=START_APPWRITE_SESSION_KEY"),
			"POST /_diag/client-error": () => new Response(null, { status: 204 }),
		}),
	});
	const failed = results.filter((r) => r.status === "fail").map((r) => r.name);
	expect(failed).toEqual([
		"readiness_appwrite",
		"bundle_without_server_names",
		"client_diagnostics_same_origin_only",
	]);
});
