import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/onboarding")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/onboarding",
			params: { locale: await getPreferredLocale() },
		});
	},
});
