import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	clientForbiddenEnvNames,
	googleRuntimeEnv,
	requiredRuntimeEnv,
	validateRuntimeEnv,
} from "../server/env";
import { createAppwriteProbe, readinessResponse } from "../server/health";
import { canonicalRedirect, publicRequestUrl } from "../server/proxy";
import {
	serveStatic,
	staticCacheControl,
	staticFilePath,
} from "../server/static";

const secret = (name: string) => `value-of-${name.toLowerCase()}-9f3a`;
function completeEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const name of requiredRuntimeEnv) env[name] = secret(name);
	Object.assign(env, {
		NODE_ENV: "production",
		START_APP_ORIGIN: "https://nfe-foot.example",
		START_APPWRITE_ENDPOINT: "https://appwrite.nfe-foot.example/v1",
		B2_REGION: "eu-central-003",
		B2_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
		START_MEDIA_PREFIX: "media/",
	});
	return env;
}

test("a complete production environment yields a bound configuration", () => {
	const result = validateRuntimeEnv({ ...completeEnv(), PORT: "8080" });
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.message);
	expect(result.config.port).toBe(8080);
	expect(result.config.host).toBe("0.0.0.0");
	expect(result.config.origin.origin).toBe("https://nfe-foot.example");
	expect(result.config.appwriteEndpoint).toBe(
		"https://appwrite.nfe-foot.example/v1",
	);
	expect(result.config.trustProxy).toBe(true);
	expect(validateRuntimeEnv(completeEnv()).ok && 3000).toBe(3000);
});

test("missing variables are listed by name and values never leak", () => {
	const {
		START_APPWRITE_SESSION_KEY: _session,
		B2_APPLICATION_KEY: _b2,
		...env
	} = completeEnv();
	env.START_APPWRITE_FEED_READER_KEY = "";
	const result = validateRuntimeEnv(env);
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected failure");
	expect(result.problems.missing).toEqual([
		"START_APPWRITE_SESSION_KEY",
		"START_APPWRITE_FEED_READER_KEY",
		"B2_APPLICATION_KEY",
	]);
	expect(result.message).toContain("missing: START_APPWRITE_SESSION_KEY");
	for (const name of requiredRuntimeEnv)
		expect(result.message).not.toContain(secret(name));
});

test("invalid shapes, shared keys and local switches are refused", () => {
	const env = completeEnv();
	env.START_APP_ORIGIN = "http://nfe-foot.example/app";
	env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
	env.START_MEDIA_PREFIX = "media";
	env.PORT = "70000";
	env.START_APPWRITE_MEDIA_WRITER_KEY = secret(
		"START_APPWRITE_MEDIA_READER_KEY",
	);
	env.START_LOCAL_RUNTIME = "1";
	env.START_AUTH_ALLOW_HTTP_LOOPBACK = "true";
	env.START_FEED_TRACE = "1";
	const result = validateRuntimeEnv(env);
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected failure");
	expect(result.problems.invalid.join("\n")).toContain("START_APP_ORIGIN");
	expect(result.problems.invalid.join("\n")).toContain("B2_ENDPOINT");
	expect(result.problems.invalid.join("\n")).toContain("START_MEDIA_PREFIX");
	expect(result.problems.invalid.join("\n")).toContain("PORT");
	expect(result.problems.invalid.join("\n")).toContain(
		"START_APPWRITE_MEDIA_WRITER_KEY (same value as START_APPWRITE_MEDIA_READER_KEY)",
	);
	expect(result.problems.forbidden).toEqual([
		"START_LOCAL_RUNTIME",
		"START_FEED_TRACE",
		"START_AUTH_ALLOW_HTTP_LOOPBACK",
	]);
	expect(result.message).not.toContain(
		secret("START_APPWRITE_MEDIA_READER_KEY"),
	);
});

test("Google OAuth variables become required only when enabled", () => {
	expect(
		validateRuntimeEnv({ ...completeEnv(), START_GOOGLE_ENABLED: "false" }).ok,
	).toBe(true);
	const result = validateRuntimeEnv({
		...completeEnv(),
		START_GOOGLE_ENABLED: "true",
	});
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected failure");
	expect(result.problems.missing).toEqual([...googleRuntimeEnv]);
});

test("client scan covers every server-only runtime variable name", () => {
	for (const name of [...requiredRuntimeEnv, ...googleRuntimeEnv])
		expect(clientForbiddenEnvNames).toContain(name);
});

test("forwarded scheme and host are honoured only from a trusted proxy", () => {
	const request = new Request("http://10.0.0.5:3000/fr/feed?page=2", {
		headers: {
			"x-forwarded-proto": "https, http",
			"x-forwarded-host": "www.nfe-foot.example",
		},
	});
	expect(publicRequestUrl(request, true).href).toBe(
		"https://www.nfe-foot.example/fr/feed?page=2",
	);
	expect(publicRequestUrl(request, false).href).toBe(
		"http://10.0.0.5:3000/fr/feed?page=2",
	);
	const hostile = new Request("http://10.0.0.5:3000/", {
		headers: { "x-forwarded-proto": "javascript", "x-forwarded-host": "a b" },
	});
	expect(publicRequestUrl(hostile, true).href).toBe("http://10.0.0.5:3000/");
});

test("alias hosts redirect to the canonical origin; health paths stay local", () => {
	const canonical = new URL("https://nfe-foot.example");
	const redirect = canonicalRedirect(
		new URL("https://www.nfe-foot.example/fr/about?x=1"),
		canonical,
		"GET",
	);
	expect(redirect?.status).toBe(308);
	expect(redirect?.headers.get("location")).toBe(
		"https://nfe-foot.example/fr/about?x=1",
	);
	expect(
		canonicalRedirect(new URL("https://nfe-foot.example/fr"), canonical, "GET"),
	).toBeUndefined();
	expect(
		canonicalRedirect(
			new URL("https://www.nfe-foot.example/_serverFn/x"),
			canonical,
			"POST",
		)?.status,
	).toBe(421);
});

test("hashed assets are immutable, other files revalidate, dotfiles never resolve", async () => {
	expect(staticCacheControl("/assets/app-Ab12Cd.js")).toBe(
		"public, max-age=31536000, immutable",
	);
	expect(staticCacheControl("/logo.svg")).toBe(
		"public, max-age=3600, must-revalidate",
	);
	const root = await mkdtemp(join(tmpdir(), "nfe-static-"));
	await writeFile(join(root, ".gitignore"), "sw.js\n");
	await writeFile(join(root, "logo.svg"), "<svg/>");
	expect(staticFilePath(root, "/.gitignore")).toBeUndefined();
	expect(staticFilePath(root, "/../etc/passwd")).toBeUndefined();
	expect(staticFilePath(root, "/logo.svg")).toBe(join(root, "logo.svg"));
	const get = await serveStatic(
		root,
		new Request("http://h/logo.svg"),
		"/logo.svg",
	);
	expect(get?.status).toBe(200);
	expect(get?.headers.get("cache-control")).toBe(
		"public, max-age=3600, must-revalidate",
	);
	expect(await get?.text()).toBe("<svg/>");
	const head = await serveStatic(
		root,
		new Request("http://h/logo.svg", { method: "HEAD" }),
		"/logo.svg",
	);
	expect(head?.headers.get("content-length")).toBe("6");
	expect(await head?.text()).toBe("");
	expect(
		await serveStatic(
			root,
			new Request("http://h/logo.svg", { method: "POST" }),
			"/logo.svg",
		),
	).toBeUndefined();
	expect(
		await serveStatic(root, new Request("http://h/missing"), "/missing"),
	).toBeUndefined();
});

test("readiness probes the keyless Appwrite version route, caches and times out", async () => {
	const calls: string[] = [];
	let clock = 1000;
	let status = 200;
	const ready = createAppwriteProbe("https://appwrite.example/v1", {
		cacheMs: 5000,
		timeoutMs: 50,
		now: () => clock,
		fetch: (async (input: string | URL | Request) => {
			calls.push(String(input));
			if (status === 0) await Bun.sleep(200);
			return new Response("{}", { status });
		}) as typeof fetch,
	});
	expect(await ready()).toBe(true);
	expect(await ready()).toBe(true);
	expect(calls).toEqual(["https://appwrite.example/v1/health/version"]);
	clock += 6000;
	status = 503;
	expect(await ready()).toBe(false);
	clock += 6000;
	status = 0;
	expect(await ready()).toBe(false);
	expect(calls.length).toBe(3);
	const response = readinessResponse(false, false);
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({
		status: "unavailable",
		checks: { appwrite: "unavailable" },
	});
	expect(readinessResponse(false, true).status).toBe(200);
	expect(readinessResponse(true, true).status).toBe(503);
});
