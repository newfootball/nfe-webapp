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

const log = (event: string) =>
	process.stdout.write(`${new Date().toISOString()} start ${event}\n`);

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

const server = Bun.serve({
	hostname: config.host,
	port: config.port,
	async fetch(request) {
		const url = publicRequestUrl(request, config.trustProxy);
		if (url.pathname === "/healthz")
			return livenessResponse(shutdown.isDraining());
		if (url.pathname === "/readyz")
			return readinessResponse(shutdown.isDraining(), await appwriteReady());
		if (shutdown.isDraining())
			return new Response("Unavailable", {
				status: 503,
				headers: { Connection: "close", "Cache-Control": "no-store" },
			});
		const redirect = canonicalRedirect(url, config.origin, request.method);
		if (redirect) return redirect;
		const pathname = decodeURIComponent(url.pathname);
		const file = await serveStatic(clientRoot, request, pathname);
		if (file) return file;
		try {
			return await handler.fetch(
				url.href === request.url ? request : new Request(url, request),
			);
		} catch {
			// Never serialize the error: it may carry upstream bodies or credentials.
			log(`request_failed method=${request.method} path=${url.pathname}`);
			return new Response("Internal Server Error", {
				status: 500,
				headers: { "Cache-Control": "no-store" },
			});
		}
	},
	error() {
		return new Response("Internal Server Error", { status: 500 });
	},
});
const shutdown = installGracefulShutdown(server, { deadlineMs: 10_000, log });
log(
	`listening host=${config.host} port=${config.port} origin=${config.origin.origin} appwrite=${new URL(config.appwriteEndpoint).host} trustProxy=${config.trustProxy}`,
);
