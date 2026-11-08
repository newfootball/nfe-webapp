import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/profile_/favorites")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/profile/favorites",
			params: { locale: await getPreferredLocale() },
		});
	},
});
