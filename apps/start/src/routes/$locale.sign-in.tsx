import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../components/auth-form";

export const Route = createFileRoute("/$locale/sign-in")({
	validateSearch: (
		search: Record<string, unknown>,
	): { oauth?: string; returnTo: string } => ({
		oauth: search.oauth === "failed" ? "failed" : "",
		returnTo: typeof search.returnTo === "string" ? search.returnTo : "",
	}),
	component: AuthPage,
});
function AuthPage() {
	const { locale, queryClient } = Route.useRouteContext();
	const { returnTo, oauth } = Route.useSearch();
	return (
		<AuthForm
			locale={locale}
			queryClient={queryClient}
			returnTo={returnTo}
			oauth={oauth}
		/>
	);
}
