import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../components/auth-form";
import { accountDeletionMessages } from "../lib/account-deletion-messages";

export const Route = createFileRoute("/$locale/sign-in")({
	validateSearch: (
		search: Record<string, unknown>,
	): { oauth?: string; returnTo: string; notice?: "account-deletion" } => ({
		notice:
			search.notice === "account-deletion" ? "account-deletion" : undefined,
		oauth: search.oauth === "failed" ? "failed" : "",
		returnTo: typeof search.returnTo === "string" ? search.returnTo : "",
	}),
	component: AuthPage,
});
function AuthPage() {
	const { locale, queryClient } = Route.useRouteContext();
	const { returnTo, oauth, notice } = Route.useSearch();
	return (
		<>
			{notice && (
				<p role="status">{accountDeletionMessages[locale].accepted}</p>
			)}
			<AuthForm
				locale={locale}
				queryClient={queryClient}
				returnTo={returnTo}
				oauth={oauth}
			/>
		</>
	);
}
