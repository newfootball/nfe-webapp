import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/profile_/change-password")({
	server: {
		handlers: {
			GET: () =>
				new Response(null, {
					status: 308,
					headers: {
						Location: "/change-password",
						"Cache-Control": "no-store",
					},
				}),
		},
	},
});
