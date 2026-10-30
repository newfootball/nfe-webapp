import { createFileRoute } from "@tanstack/react-router";
import { platformManifest } from "../lib/platform-pwa";
export const Route = createFileRoute("/manifest.webmanifest")({
	server: {
		handlers: {
			GET: () =>
				new Response(JSON.stringify(platformManifest), {
					headers: {
						"Content-Type": "application/manifest+json",
						"Cache-Control": "no-store",
						"X-Content-Type-Options": "nosniff",
					},
				}),
		},
	},
});
