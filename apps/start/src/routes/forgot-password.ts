import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/forgot-password")({
	server: {
		handlers: {
			GET: () =>
				new Response(null, {
					status: 303,
					headers: {
						Location: "/fr/recovery?flow=forgot",
						"Cache-Control": "private, no-store",
						"Referrer-Policy": "no-referrer",
					},
				}),
		},
	},
});
