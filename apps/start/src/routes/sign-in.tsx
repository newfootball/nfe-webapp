import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
		typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {},
	beforeLoad: async ({ search }) => {
		throw redirect({
			to: "/$locale/sign-in",
			params: { locale: await getPreferredLocale() },
			search: { returnTo: search.returnTo ?? "" },
		});
	},
});
