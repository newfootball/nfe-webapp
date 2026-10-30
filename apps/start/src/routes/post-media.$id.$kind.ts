import { createFileRoute } from "@tanstack/react-router";
import { postMediaResponse } from "../lib/media-routes.server";
export const Route = createFileRoute("/post-media/$id/$kind")({
	server: {
		handlers: {
			GET: ({ params }) => postMediaResponse(params.id, params.kind),
		},
	},
});
