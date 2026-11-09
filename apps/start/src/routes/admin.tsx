import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreferredLocale } from "../lib/locale";
export const Route = createFileRoute("/admin")({
	beforeLoad: async () => {
		throw redirect({
			to: "/$locale/admin",
			params: { locale: await getPreferredLocale() },
			search: { kind: "reports", q: "", status: "PENDING", cursor: null },
		});
	},
});
