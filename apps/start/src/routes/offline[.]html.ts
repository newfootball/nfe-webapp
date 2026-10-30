import { createFileRoute } from "@tanstack/react-router";
import { offlineDocument } from "../lib/platform-pwa";
export const Route = createFileRoute("/offline.html")({
	server: {
		handlers: {
			GET: () =>
				new Response(offlineDocument, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"Cache-Control": "no-store",
						"X-Content-Type-Options": "nosniff",
					},
				}),
		},
	},
});
