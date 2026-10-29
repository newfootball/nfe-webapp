import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
import { ExploreSearchSchema } from "./$locale.explore";
export const Route = createFileRoute("/explore")({
	validateSearch: (value) => ExploreSearchSchema.parse(value),
	beforeLoad: async ({ search }) => {
		throw redirect({
			to: "/$locale/explore",
			params: { locale: await getPreferredLocale() },
			search,
		});
	},
});
