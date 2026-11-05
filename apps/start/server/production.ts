// Production entry for the built Start app (Refs #64). Listens on HOST:PORT for
// the container network; TLS, domains and routing belong to the Traefik proxy.
import { resolve } from "node:path";
import { validateRuntimeEnv } from "./env";
import {
	createAppwriteProbe,
	livenessResponse,
	readinessResponse,
} from "./health";
import { canonicalRedirect, publicRequestUrl } from "./proxy";
import { installGracefulShutdown } from "./shutdown";
import { serveStatic } from "./static";
import {
	breachedThresholds,
	createRateLimit,
	createRequestMetrics,
	jsonLine,
	logPath,
	parseClientError,
	readResources,
} from "./telemetry";

const log = (event: string) =>
	process.stdout.write(`${new Date().toISOString()} start ${event}\n`);
const emit = (event: string, fields: Record<string, unknown>) =>
	process.stdout.write(jsonLine(event, fields));

const validated = validateRuntimeEnv(process.env);
if (!validated.ok) {
	process.stderr.write(`${validated.message}\n`);
	process.exit(1);
}
const config = validated.config;
const clientRoot = resolve(import.meta.dir, "../dist/client");
const handler = await import("../dist/server/server.js")
	.then(
		(module) =>
			module.default as {
				fetch(request: Request): Promise<Response> | Response;
			},
	)
	.catch(() => {
		process.stderr.write("Build output missing: run `bun run build` first.\n");
		process.exit(1);
	});
const appwriteReady = createAppwriteProbe(config.appwriteEndpoint);
const metrics = createRequestMetrics();
const clientErrorBudget = createRateLimit(60, 60_000);
const metricsIntervalMs = 60_000;
const clientErrorPath = "/_diag/client-error";
const noStore = { "Cache-Control": "no-store" };

async function clientError(request: Request) {
	if (request.method !== "POST")
		return new Response(null, { status: 405, headers: noStore });
	const body = await request.text().catch(() => "");
	const report = parseClientError(
		body,
		request.headers.get("origin"),
		request.headers.get("sec-fetch-site"),
		config.origin.origin,
	);
	if (!report) return new Response(null, { status: 403, headers: noStore });
	if (clientErrorBudget()) emit("client_error", report);
	return new Response(null, { status: 204, headers: noStore });
}

async function route(request: Request, url: URL, requestId: string) {
	if (shutdown.isDraining())
		return new Response("Unavailable", {
			status: 503,
			headers: { Connection: "close", ...noStore },
		});
	const redirect = canonicalRedirect(url, config.origin, request.method);
	if (redirect) return redirect;
	if (url.pathname === clientErrorPath) return clientError(request);
	const pathname = decodeURIComponent(url.pathname);
	const file = await serveStatic(clientRoot, request, pathname);
	if (file) return file;
	try {
		return await handler.fetch(
			url.href === request.url ? request : new Request(url, request),
		);
	} catch (error) {
		// Never serialize the error: it may carry upstream bodies or credentials.
		emit("request_failed", {
			id: requestId,
			method: request.method,
			path: logPath(url.pathname),
			error: error instanceof Error ? error.name : typeof error,
		});
		return new Response("Internal Server Error", {
			status: 500,
			headers: noStore,
		});
	}
}

const server = Bun.serve({
	hostname: config.host,
	port: config.port,
	async fetch(request) {
		const url = publicRequestUrl(request, config.trustProxy);
		if (url.pathname === "/healthz")
			return livenessResponse(shutdown.isDraining());
		if (url.pathname === "/readyz")
			return readinessResponse(shutdown.isDraining(), await appwriteReady());
		const started = performance.now();
		const requestId = crypto.randomUUID().slice(0, 8);
		metrics.begin();
		let status = 500;
		try {
			const response = await route(request, url, requestId);
			status = response.status;
			return response;
		} finally {
			const durationMs = Math.round(performance.now() - started);
			metrics.end(status, durationMs);
			if (!url.pathname.startsWith("/assets/"))
				emit("request", {
					id: requestId,
					method: request.method,
					path: logPath(url.pathname),
					status,
					ms: durationMs,
				});
		}
	},
	error() {
		return new Response("Internal Server Error", { status: 500 });
	},
});
const shutdown = installGracefulShutdown(server, { deadlineMs: 10_000, log });
const metricsTimer = setInterval(async () => {
	const window = metrics.flush();
	const resources = await readResources();
	emit("metrics", { ...window, ...resources });
	for (const alert of breachedThresholds(window, resources))
		emit("threshold_breached", { alert });
}, metricsIntervalMs);
metricsTimer.unref();
log(
	`listening host=${config.host} port=${config.port} origin=${config.origin.origin} appwrite=${new URL(config.appwriteEndpoint).host} trustProxy=${config.trustProxy}`,
);
