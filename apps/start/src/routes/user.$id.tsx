import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/user/$id")({
	beforeLoad: async ({ params }) => {
		throw redirect({
			to: "/$locale/user/$id",
			params: { locale: await getPreferredLocale(), id: params.id },
		});
	},
});
