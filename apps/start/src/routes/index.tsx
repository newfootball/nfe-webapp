import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale",
			params: { locale: await getPreferredLocale() },
		});
	},
});
