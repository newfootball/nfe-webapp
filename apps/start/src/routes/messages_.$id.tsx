import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/messages_/$id")({
	beforeLoad: async ({ params }) => {
		throw redirect({
			to: "/$locale/messages/$id",
			params: { locale: await getPreferredLocale(), id: params.id },
		});
	},
});
