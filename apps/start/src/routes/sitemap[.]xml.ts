import { createFileRoute } from "@tanstack/react-router";
import { sitemapResponse } from "../lib/sitemap.server";
export const Route = createFileRoute("/sitemap.xml")({
	server: { handlers: { GET: ({ request }) => sitemapResponse(request) } },
});
