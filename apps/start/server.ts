import { resolve, sep } from "node:path";
import handler from "./dist/server/server.js";

// Local built-app runner only; production deployment is intentionally unchanged.
const clientRoot = resolve(import.meta.dir, "dist/client");
Bun.serve({
	hostname: "127.0.0.1",
	port: Number(process.env.PORT ?? 3501),
	async fetch(request) {
		const pathname = decodeURIComponent(new URL(request.url).pathname);
		const path = resolve(clientRoot, `.${pathname}`);
		if (path.startsWith(`${clientRoot}${sep}`)) {
			const file = Bun.file(path);
			if (await file.exists()) return new Response(file);
		}
		return handler.fetch(request);
	},
});
