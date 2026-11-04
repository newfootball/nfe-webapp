// Runtime configuration contract of the production Start server (Refs #64).
// Every check here reports variable NAMES only; values never reach logs or responses.
// Keep this list aligned with the `process.env` reads in `src/lib/*.server.ts`.

/** Required at boot: the server refuses to listen when any of these is missing. */
export const requiredRuntimeEnv = [
	"START_APP_ORIGIN",
	"START_APPWRITE_ENDPOINT",
	"START_APPWRITE_PROJECT",
	"START_APPWRITE_DATABASE",
	"START_APPWRITE_SESSION_KEY",
	"START_APPWRITE_FEED_READER_KEY",
	"START_APPWRITE_PROFILE_WRITER_KEY",
	"START_APPWRITE_FOLLOW_WRITER_KEY",
	"START_APPWRITE_INTERACTION_WRITER_KEY",
	"START_APPWRITE_POST_TEXT_WRITER_KEY",
	"START_APPWRITE_MESSAGING_WRITER_KEY",
	"START_APPWRITE_MODERATION_READER_KEY",
	"START_APPWRITE_MODERATION_WRITER_KEY",
	"START_APPWRITE_NOTIFICATION_WRITER_KEY",
	"START_APPWRITE_LIFECYCLE_WRITER_KEY",
	"START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY",
	"START_APPWRITE_MEDIA_READER_KEY",
	"START_APPWRITE_MEDIA_WRITER_KEY",
	"B2_APPLICATION_KEY_ID",
	"B2_APPLICATION_KEY",
	"B2_BUCKET_NAME",
	"B2_REGION",
	"B2_ENDPOINT",
	"START_MEDIA_PREFIX",
] as const;

/** Required only when `START_GOOGLE_ENABLED=true`. */
export const googleRuntimeEnv = [
	"START_GOOGLE_CLIENT_ID",
	"START_GOOGLE_CLIENT_SECRET",
	"START_OAUTH_BROKER_KEY",
	"START_OAUTH_REDIS_URL",
	"START_OAUTH_REGISTRY_PATH",
] as const;

/** Optional tuning read by the server or the Start modules. */
export const optionalRuntimeEnv = [
	"PORT",
	"HOST",
	"NODE_ENV",
	"START_TRUST_PROXY",
	"START_GOOGLE_ENABLED",
	"START_RECOVERY_INVALIDATION_CONFIRMED",
	"START_MEDIA_MAX_VIDEO_BYTES",
	"START_MEDIA_MAX_IMAGE_BYTES",
	"START_MEDIA_READ_TTL_SECONDS",
	"START_MEDIA_MAX_DURATION",
	"START_MEDIA_PROCESS_TIMEOUT_MS",
] as const;

/** Local/synthetic switches that must never be set on a production process. */
export const forbiddenRuntimeEnv = [
	"START_LOCAL_RUNTIME",
	"START_FEED_TRACE",
	"START_LIFECYCLE_SYNTHETIC_PROJECT",
	"START_LIFECYCLE_SYNTHETIC_PREFIX",
	"START_LIFECYCLE_FAILURE_POINT",
	"START_ACCOUNT_DELETION_SYNTHETIC_PROJECT",
	"START_ACCOUNT_DELETION_FAILURE_POINT",
] as const;

/** Names that must never appear in the client bundle (scanned by `scripts/check-client.ts`). */
export const clientForbiddenEnvNames: readonly string[] = [
	...requiredRuntimeEnv,
	...googleRuntimeEnv,
	"START_RECOVERY_INVALIDATION_CONFIRMED",
	"START_TRUST_PROXY",
];

export type RuntimeConfig = {
	host: string;
	port: number;
	origin: URL;
	appwriteEndpoint: string;
	trustProxy: boolean;
};
export type RuntimeEnvProblems = {
	missing: string[];
	invalid: string[];
	forbidden: string[];
};
export type RuntimeEnvResult =
	| { ok: true; config: RuntimeConfig }
	| { ok: false; problems: RuntimeEnvProblems; message: string };

type Env = Record<string, string | undefined>;
const present = (value: string | undefined): value is string =>
	typeof value === "string" && value.trim().length > 0;

function parseUrl(value: string | undefined) {
	try {
		return present(value) ? new URL(value) : undefined;
	} catch {
		return undefined;
	}
}
function parsePort(value: string | undefined) {
	if (!present(value)) return 3000;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 && parsed < 65536
		? parsed
		: undefined;
}

function collectMissing(env: Env) {
	const missing: string[] = [];
	for (const name of requiredRuntimeEnv)
		if (!present(env[name])) missing.push(name);
	if (env.START_GOOGLE_ENABLED === "true")
		for (const name of googleRuntimeEnv)
			if (!present(env[name])) missing.push(name);
	return missing;
}
function collectForbidden(env: Env) {
	const forbidden: string[] = [];
	for (const name of forbiddenRuntimeEnv)
		if (env[name] !== undefined) forbidden.push(name);
	if (env.START_AUTH_ALLOW_HTTP_LOOPBACK === "true")
		forbidden.push("START_AUTH_ALLOW_HTTP_LOOPBACK");
	return forbidden;
}
// The modules refuse shared credentials: every Appwrite key must be distinct.
function collectSharedKeys(env: Env) {
	const seen = new Map<string, string>();
	const shared: string[] = [];
	for (const name of requiredRuntimeEnv) {
		const value = env[name];
		if (!name.endsWith("_KEY") || !present(value)) continue;
		const first = seen.get(value);
		if (first) shared.push(`${name} (same value as ${first})`);
		else seen.set(value, name);
	}
	return shared;
}
function collectInvalid(env: Env) {
	const checks: [string, boolean][] = [
		[
			"NODE_ENV (must be production)",
			present(env.NODE_ENV) && env.NODE_ENV !== "production",
		],
		[
			"START_TRUST_PROXY (true or false)",
			present(env.START_TRUST_PROXY) &&
				!["true", "false"].includes(env.START_TRUST_PROXY),
		],
		["PORT (1-65535)", parsePort(env.PORT) === undefined],
		[
			"START_APP_ORIGIN (https origin without path)",
			present(env.START_APP_ORIGIN) && !isHttpsOrigin(env.START_APP_ORIGIN),
		],
		[
			"START_APPWRITE_ENDPOINT (https URL)",
			present(env.START_APPWRITE_ENDPOINT) &&
				parseUrl(env.START_APPWRITE_ENDPOINT)?.protocol !== "https:",
		],
		[
			"B2_ENDPOINT (https://s3.<B2_REGION>.backblazeb2.com)",
			present(env.B2_ENDPOINT) &&
				present(env.B2_REGION) &&
				!isB2Endpoint(env.B2_ENDPOINT, env.B2_REGION),
		],
		[
			"START_MEDIA_PREFIX (path prefix ending with /)",
			present(env.START_MEDIA_PREFIX) &&
				!/^[a-zA-Z0-9/_-]{1,200}\/$/.test(env.START_MEDIA_PREFIX),
		],
	];
	return [
		...checks.filter(([, failed]) => failed).map(([label]) => label),
		...collectSharedKeys(env),
	];
}
function isHttpsOrigin(value: string) {
	const url = parseUrl(value);
	return (
		!!url &&
		url.protocol === "https:" &&
		url.origin === value &&
		!url.username &&
		!url.password
	);
}
function isB2Endpoint(value: string, region: string) {
	const url = parseUrl(value);
	return (
		!!url &&
		url.protocol === "https:" &&
		url.hostname === `s3.${region}.backblazeb2.com`
	);
}

export function validateRuntimeEnv(env: Env): RuntimeEnvResult {
	const problems: RuntimeEnvProblems = {
		missing: collectMissing(env),
		invalid: collectInvalid(env),
		forbidden: collectForbidden(env),
	};
	if (
		problems.missing.length ||
		problems.invalid.length ||
		problems.forbidden.length
	)
		return { ok: false, problems, message: describeProblems(problems) };
	const endpoint = parseUrl(env.START_APPWRITE_ENDPOINT) as URL;
	return {
		ok: true,
		config: {
			host: present(env.HOST) ? env.HOST : "0.0.0.0",
			port: parsePort(env.PORT) as number,
			origin: new URL(env.START_APP_ORIGIN as string),
			appwriteEndpoint: endpoint.href.replace(/\/+$/, ""),
			trustProxy: env.START_TRUST_PROXY !== "false",
		},
	};
}

export function describeProblems(problems: RuntimeEnvProblems) {
	const lines = ["Start production configuration is invalid."];
	if (problems.missing.length)
		lines.push(`  missing: ${problems.missing.join(", ")}`);
	if (problems.invalid.length)
		lines.push(`  invalid: ${problems.invalid.join("; ")}`);
	if (problems.forbidden.length)
		lines.push(
			`  forbidden in production (unset them): ${problems.forbidden.join(", ")}`,
		);
	lines.push("See docs/migration/start-production.md for the variable table.");
	return lines.join("\n");
}
