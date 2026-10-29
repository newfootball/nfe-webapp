import { createFileRoute } from "@tanstack/react-router";
import { readLocale } from "../lib/locale.server";
export const Route = createFileRoute("/forgot-password")({
	server: {
		handlers: {
			GET: async () =>
				new Response(null, {
					status: 303,
					headers: {
						Location: `/${await readLocale()}/recovery?flow=forgot`,
						"Cache-Control": "private, no-store",
						"Referrer-Policy": "no-referrer",
					},
				}),
		},
	},
});
