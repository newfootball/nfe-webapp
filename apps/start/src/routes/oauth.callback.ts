import { createFileRoute } from "@tanstack/react-router";
import { completeGoogle } from "../lib/oauth.server";
export const Route = createFileRoute("/oauth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				let location = "/fr/sign-in?oauth=failed";
				try {
					location = await completeGoogle(new URL(request.url));
				} catch {
					/* Never log callback URL, code, or upstream error. */
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
