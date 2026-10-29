import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/verify-email")({
	server: {
		handlers: {
			GET: () =>
				new Response(null, {
					status: 303,
					headers: {
						Location: "/fr/recovery?flow=settings",
						"Cache-Control": "private, no-store",
						"Referrer-Policy": "no-referrer",
					},
				}),
		},
	},
});
