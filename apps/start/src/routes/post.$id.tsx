import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/post/$id")({
	beforeLoad: async ({ params }) => {
		throw redirect({
			to: "/$locale/post/$id",
			params: { locale: await getPreferredLocale(), id: params.id },
		});
	},
});
