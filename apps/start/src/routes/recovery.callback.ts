import { createFileRoute } from "@tanstack/react-router";
import { captureChallenge } from "../lib/recovery.server";
export const Route = createFileRoute("/recovery/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				let location = "/fr/recovery?flow=invalid";
				try {
					location = await captureChallenge(new URL(request.url));
				} catch {
					/* Never render/hydrate/log challenge parameters. */
				}
				return new Response(null, {
					status: 303,
					headers: {
						Location: location,
						"Cache-Control": "private, no-store",
						"Referrer-Policy": "no-referrer",
					},
				});
			},
		},
	},
});
