// Read-only smoke of a deployed Start release behind its real proxy (Refs #64).
// Usage: bun scripts/production-smoke.ts [origin] (default https://nfe-foot.com)
// Optional: SMOKE_ALIAS_ORIGIN (default www.<host>), SMOKE_MEDIA_PATH (a public
// /media/<id> or /post-media/<id>/<kind> path; otherwise taken from the home page).
// Exit 1 on a failed check, 2 when a check could not run (e.g. no public media).
// Sends GET/HEAD/OPTIONS plus one rejected cross-origin diagnostic POST. Never
// prints signed URLs, cookies or response bodies.
import { clientForbiddenEnvNames } from "../server/env";

export type CheckResult = {
	name: string;
	status: "pass" | "fail" | "not_run";
	detail: string;
};

export function assetPaths(html: string) {
	return [
		...new Set(
			[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map(
				(match) => match[1] as string,
			),
		),
	];
}

export function chunkImports(js: string) {
	return [
		...new Set(
			[
				...js.matchAll(
					/["'(]\.?\.?\/?(?:assets\/)?([\w.-]+-[\w-]{6,}\.js)["')]/g,
				),
			].map((match) => `/assets/${match[1]}`),
		),
	];
}

export function mediaPathFrom(html: string) {
	return html.match(
		/\/(?:post-media\/[\w-]+\/(?:thumbnail|video)|media\/[\w-]+)(?=["'?\s])/,
	)?.[0];
}

export function leakedNames(
	text: string,
	names: readonly string[] = clientForbiddenEnvNames,
) {
	return names.filter((name) => text.includes(name));
}

// Describe a signed capability without its credential or signature.
export function describeSignedUrl(location: string) {
	const url = new URL(location);
	return {
		host: url.host,
		expires: Number(url.searchParams.get("X-Amz-Expires") ?? Number.NaN),
		signed: url.searchParams.has("X-Amz-Signature"),
		pinned: url.searchParams.has("versionId"),
		noStore:
			url.searchParams.get("response-cache-control")?.includes("no-store") ??
			false,
	};
}

type Fetcher = typeof fetch;
type Smoke = {
	base: URL;
	doFetch: Fetcher;
	get(path: string, init?: RequestInit): Promise<Response>;
	record(name: string, ok: boolean, detail: string): void;
	skip(name: string, detail: string): void;
};
const immutableCache = "public, max-age=31536000, immutable";
const foreignOrigin = "https://attacker.invalid";

async function checkService(smoke: Smoke) {
	const health = await smoke.get("/healthz");
	const healthBody = (await health.json().catch(() => ({}))) as {
		status?: string;
	};
	smoke.record(
		"liveness",
		health.status === 200 && healthBody.status === "ok",
		`GET /healthz ${health.status}`,
	);
	const ready = await smoke.get("/readyz");
	const readyBody = (await ready.json().catch(() => ({}))) as {
		checks?: { appwrite?: string };
	};
	smoke.record(
		"readiness_appwrite",
		ready.status === 200 && readyBody.checks?.appwrite === "ok",
		`GET /readyz ${ready.status} appwrite=${readyBody.checks?.appwrite}`,
	);
	const started = performance.now();
	const page = await smoke.get("/fr");
	const html = await page.text();
	smoke.record(
		"ssr_fr",
		page.status === 200 &&
			/<html[^>]*lang="fr"/.test(html) &&
			html.includes("/assets/"),
		`GET /fr ${page.status} ${Math.round(performance.now() - started)}ms`,
	);
	return html;
}

async function checkAlias(smoke: Smoke, aliasOrigin?: string) {
	const alias = new URL(
		aliasOrigin ?? `${smoke.base.protocol}//www.${smoke.base.host}`,
	);
	const aliased = await smoke
		.doFetch(new URL("/fr?smoke=1", alias), { redirect: "manual" })
		.catch(() => undefined);
	if (!aliased)
		return smoke.skip("alias_redirect", `${alias.host} unreachable`);
	smoke.record(
		"alias_redirect",
		aliased.status === 308 &&
			aliased.headers.get("location") === `${smoke.base.origin}/fr?smoke=1`,
		`GET ${alias.host}/fr ${aliased.status}`,
	);
}

async function checkBundle(smoke: Smoke, html: string) {
	const queue = assetPaths(html);
	const seen = new Set<string>();
	const leaks = new Set<string>();
	let immutable = queue.length > 0;
	while (queue.length && seen.size < 80) {
		const path = queue.shift() as string;
		if (seen.has(path)) continue;
		seen.add(path);
		const response = await smoke.get(path);
		const body = await response.text();
		immutable &&=
			response.status === 200 &&
			response.headers.get("cache-control") === immutableCache;
		for (const name of leakedNames(body)) leaks.add(name);
		if (path.endsWith(".js"))
			queue.push(...chunkImports(body).filter((next) => !seen.has(next)));
	}
	smoke.record(
		"assets_immutable",
		immutable,
		`${seen.size} hashed assets checked`,
	);
	smoke.record(
		"bundle_without_server_names",
		seen.size > 0 && leaks.size === 0,
		leaks.size
			? `leaked: ${[...leaks].join(",")}`
			: `${seen.size} assets scanned`,
	);
	smoke.record(
		"ssr_without_server_names",
		leakedNames(html).length === 0,
		"SSR HTML scanned",
	);
}

async function checkDiagnostics(smoke: Smoke) {
	const diag = await smoke.get("/_diag/client-error", {
		method: "POST",
		headers: { Origin: foreignOrigin, "Content-Type": "application/json" },
		body: JSON.stringify({ kind: "error", message: "smoke", path: "/" }),
	});
	smoke.record(
		"client_diagnostics_same_origin_only",
		diag.status === 403,
		`cross-origin POST ${diag.status}`,
	);
}

async function checkMedia(smoke: Smoke, mediaPath: string | undefined) {
	if (!mediaPath)
		return smoke.skip(
			"media_signed_redirect",
			"no public media on /fr and SMOKE_MEDIA_PATH unset",
		);
	const media = await smoke.get(mediaPath);
	const location = media.headers.get("location");
	if (!location || media.status < 300 || media.status > 399)
		return smoke.record(
			"media_signed_redirect",
			false,
			`GET ${mediaPath} ${media.status}`,
		);
	const signed = describeSignedUrl(location);
	smoke.record(
		"media_signed_redirect",
		signed.signed &&
			signed.pinned &&
			signed.noStore &&
			signed.expires > 0 &&
			signed.expires <= 120 &&
			media.headers.get("cache-control") === "private, no-store" &&
			media.headers.get("referrer-policy") === "no-referrer",
		`${media.status} → ${signed.host} expires=${signed.expires}s pinned=${signed.pinned}`,
	);
	const range = await smoke.doFetch(location, {
		headers: { Range: "bytes=0-1023" },
	});
	const rangeBody = await range.arrayBuffer();
	smoke.record(
		"b2_range_read",
		range.status === 206 &&
			/^bytes 0-\d+\/\d+$/.test(range.headers.get("content-range") ?? "") &&
			rangeBody.byteLength <= 1024,
		`Range 0-1023 ${range.status} ${rangeBody.byteLength}B`,
	);
	await checkBucketCors(smoke, location);
}

async function checkBucketCors(smoke: Smoke, location: string) {
	const bucketUrl = new URL(location);
	bucketUrl.search = "";
	const preflight = await smoke.doFetch(bucketUrl, {
		method: "OPTIONS",
		headers: {
			Origin: smoke.base.origin,
			"Access-Control-Request-Method": "PUT",
			"Access-Control-Request-Headers": "content-type",
		},
	});
	const allowed = preflight.headers.get("access-control-allow-origin");
	smoke.record(
		"b2_cors_upload_preflight",
		preflight.ok &&
			allowed === smoke.base.origin &&
			/PUT/i.test(preflight.headers.get("access-control-allow-methods") ?? ""),
		`OPTIONS PUT ${preflight.status} allow-origin=${allowed === smoke.base.origin ? "origin" : allowed}`,
	);
	const foreign = await smoke.doFetch(bucketUrl, {
		method: "OPTIONS",
		headers: { Origin: foreignOrigin, "Access-Control-Request-Method": "PUT" },
	});
	smoke.record(
		"b2_cors_rejects_foreign_origin",
		!foreign.ok &&
			!["*", foreignOrigin].includes(
				foreign.headers.get("access-control-allow-origin") ?? "",
			),
		`OPTIONS from foreign origin ${foreign.status}`,
	);
}

export async function runSmoke(
	origin: string,
	options: { aliasOrigin?: string; mediaPath?: string; fetch?: Fetcher } = {},
) {
	const doFetch = options.fetch ?? fetch;
	const base = new URL(origin);
	const results: CheckResult[] = [];
	const smoke: Smoke = {
		base,
		doFetch,
		get: (path, init = {}) =>
			doFetch(new URL(path, base), { redirect: "manual", ...init }),
		record: (name, ok, detail) => {
			results.push({ name, status: ok ? "pass" : "fail", detail });
		},
		skip: (name, detail) => {
			results.push({ name, status: "not_run", detail });
		},
	};
	const html = await checkService(smoke);
	await checkAlias(smoke, options.aliasOrigin);
	await checkBundle(smoke, html);
	await checkDiagnostics(smoke);
	await checkMedia(smoke, options.mediaPath ?? mediaPathFrom(html));
	return results;
}

if (import.meta.main) {
	const origin =
		process.argv[2] ?? process.env.SMOKE_ORIGIN ?? "https://nfe-foot.com";
	const results = await runSmoke(origin, {
		aliasOrigin: process.env.SMOKE_ALIAS_ORIGIN,
		mediaPath: process.env.SMOKE_MEDIA_PATH,
	});
	const out = (line: string) => process.stdout.write(`${line}\n`);
	for (const result of results)
		out(
			`${result.status.padEnd(7)} ${result.name.padEnd(36)} ${result.detail}`,
		);
	const failed = results.filter((result) => result.status === "fail");
	const notRun = results.filter((result) => result.status === "not_run");
	out(
		JSON.stringify({
			origin,
			at: new Date().toISOString(),
			pass: results.length - failed.length - notRun.length,
			fail: failed.length,
			notRun: notRun.map((result) => result.name),
		}),
	);
	process.exit(failed.length ? 1 : notRun.length ? 2 : 0);
}
