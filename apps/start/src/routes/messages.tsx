import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/messages")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/messages",
			params: { locale: await getPreferredLocale() },
		});
	},
});
