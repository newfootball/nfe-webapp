import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/post_/$id/edit")({
	beforeLoad: async ({ params }) => {
		throw redirect({
			to: "/$locale/post/$id/edit",
			params: { locale: await getPreferredLocale(), id: params.id },
		});
	},
});
