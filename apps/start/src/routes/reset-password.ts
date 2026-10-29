import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/reset-password")({
	server: {
		handlers: {
			GET: () =>
				new Response(null, {
					status: 303,
					headers: {
						Location: "/fr/recovery?flow=reset",
						"Cache-Control": "private, no-store",
						"Referrer-Policy": "no-referrer",
					},
				}),
		},
	},
});
