import { createFileRoute } from "@tanstack/react-router";
import { mutation } from "../lib/auth-context.server";
import { beginGoogle } from "../lib/oauth.server";
export const Route = createFileRoute("/oauth/google")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					mutation();
					const form = await request.formData();
					if (
						[...form.keys()].some((key) => key !== "locale") ||
						form.getAll("locale").length !== 1
					)
						throw new Error("Invalid input");
					const locale = form.get("locale");
					if (locale !== "fr" && locale !== "en")
						throw new Error("Invalid locale");
					return new Response(null, {
						status: 303,
						headers: {
							Location: await beginGoogle(locale),
							"Cache-Control": "private, no-store",
							"Referrer-Policy": "no-referrer",
						},
					});
				} catch {
					return new Response(null, {
						status: 303,
						headers: {
							Location: "/fr/sign-in?oauth=failed",
							"Cache-Control": "private, no-store",
							"Referrer-Policy": "no-referrer",
						},
					});
				}
			},
		},
	},
});
