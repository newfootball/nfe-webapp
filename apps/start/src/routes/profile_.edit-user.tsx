import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/profile_/edit-user")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/profile/edit-user",
			params: { locale: await getPreferredLocale() },
		});
	},
});
