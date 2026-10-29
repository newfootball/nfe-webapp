import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/change-password")({
	server: {
		handlers: {
			GET: () =>
				new Response(null, {
					status: 303,
					headers: {
						Location: "/fr/recovery?flow=change",
						"Cache-Control": "private, no-store",
						"Referrer-Policy": "no-referrer",
					},
				}),
		},
	},
});
