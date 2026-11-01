import { resolve, sep } from "node:path";
import handler from "./dist/server/server.js";
import { localHealth } from "./scripts/local-runtime-health";

// Local built-app runner only; production deployment is intentionally unchanged.
const clientRoot = resolve(import.meta.dir, "dist/client");
let draining = false;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: Number(process.env.PORT ?? 3501),
	async fetch(request) {
		const pathname = decodeURIComponent(new URL(request.url).pathname);
		const health = await localHealth(pathname, draining);
		if (health) return health;
		if (draining) return new Response("Unavailable", { status: 503 });
		const path = resolve(clientRoot, `.${pathname}`);
		if (path.startsWith(`${clientRoot}${sep}`)) {
			const file = Bun.file(path);
			if (await file.exists()) return new Response(file);
		}
		return handler.fetch(request);
	},
});

// Drain in-flight requests before exiting; a bounded deadline closes stuck clients.
async function shutdown() {
	if (draining) return;
	draining = true;
	const deadline = setTimeout(() => {
		void server.stop(true);
	}, 10_000);
	deadline.unref();
	await server.stop(false);
	clearTimeout(deadline);
	process.exit(0);
}
process.once("SIGTERM", () => {
	void shutdown();
});
process.once("SIGINT", () => {
	void shutdown();
});
