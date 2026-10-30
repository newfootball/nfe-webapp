import { createFileRoute } from "@tanstack/react-router";
import { assetResponse } from "../lib/media-routes.server";
export const Route = createFileRoute("/media/$id")({
	server: { handlers: { GET: ({ params }) => assetResponse(params.id) } },
});
