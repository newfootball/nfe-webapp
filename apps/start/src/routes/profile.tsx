import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/profile")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/profile",
			params: { locale: await getPreferredLocale() },
		});
	},
});
