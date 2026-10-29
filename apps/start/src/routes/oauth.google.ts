import { createFileRoute } from "@tanstack/react-router";
import { mutation } from "../lib/auth-context.server";
import { beginGoogle } from "../lib/oauth.server";
import { googleStartResponse } from "../lib/oauth-start-handler";
export const Route = createFileRoute("/oauth/google")({
	server: {
		handlers: {
			POST: ({ request }) =>
				googleStartResponse(request, mutation, beginGoogle),
		},
	},
});
