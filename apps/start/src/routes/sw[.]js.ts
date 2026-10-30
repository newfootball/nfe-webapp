import { createFileRoute } from "@tanstack/react-router";
import { serviceWorker } from "../lib/platform-pwa";
export const Route = createFileRoute("/sw.js")({
	server: {
		handlers: {
			GET: () =>
				new Response(serviceWorker, {
					headers: {
						"Content-Type": "application/javascript; charset=utf-8",
						"Cache-Control": "no-store",
						"X-Content-Type-Options": "nosniff",
						"Service-Worker-Allowed": "/",
					},
				}),
		},
	},
});
