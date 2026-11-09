import {
	createFileRoute,
	redirect,
	stripSearchParams,
} from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
import { ExploreSearchSchema, exploreSearchDefaults } from "./$locale.explore";
export const Route = createFileRoute("/explore")({
	validateSearch: ExploreSearchSchema,
	search: { middlewares: [stripSearchParams(exploreSearchDefaults)] },
	beforeLoad: async ({ search }) => {
		throw redirect({
			to: "/$locale/explore",
			params: { locale: await getPreferredLocale() },
			search,
		});
	},
});
