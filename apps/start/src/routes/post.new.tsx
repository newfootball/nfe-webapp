import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/post/new")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/publish",
			params: { locale: await getPreferredLocale() },
		});
	},
});
