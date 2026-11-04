import { resolve, sep } from "node:path";
import handler from "./dist/server/server.js";
import { localHealth } from "./scripts/local-runtime-health";
import { installGracefulShutdown } from "./server/shutdown";

// Local built-app runner only; production uses server/production.ts.
const clientRoot = resolve(import.meta.dir, "dist/client");
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: Number(process.env.PORT ?? 3501),
	async fetch(request) {
		const pathname = decodeURIComponent(new URL(request.url).pathname);
		const health = await localHealth(pathname, shutdown.isDraining());
		if (health) return health;
		if (shutdown.isDraining())
			return new Response("Unavailable", { status: 503 });
		const path = resolve(clientRoot, `.${pathname}`);
		if (path.startsWith(`${clientRoot}${sep}`)) {
			const file = Bun.file(path);
			if (await file.exists()) return new Response(file);
		}
		return handler.fetch(request);
	},
});
const shutdown = installGracefulShutdown(server, { deadlineMs: 10_000 });
