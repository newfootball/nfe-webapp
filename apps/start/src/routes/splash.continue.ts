import { createFileRoute } from "@tanstack/react-router";
import { continueSplash } from "../lib/public-pages.server";
export const Route = createFileRoute("/splash/continue")({
	server: { handlers: { GET: ({ request }) => continueSplash(request) } },
});
