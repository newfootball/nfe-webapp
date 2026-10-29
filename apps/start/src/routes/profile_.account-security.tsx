import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/profile_/account-security")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/profile/account-security",
			params: { locale: await getPreferredLocale() },
		});
	},
});
