import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/notifications")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/notifications",
			params: { locale: await getPreferredLocale() },
		});
	},
});
