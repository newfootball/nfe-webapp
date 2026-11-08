import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/offline")({
	server: {
		handlers: {
			GET: () =>
				new Response(null, {
					status: 308,
					headers: { Location: "/offline.html", "Cache-Control": "no-store" },
				}),
		},
	},
});
