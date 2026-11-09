import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AuthForm } from "../components/auth-form";
import { Notice } from "../components/auth-shell";
import { accountDeletionMessages } from "../lib/account-deletion-messages";
import { getGoogleAvailability } from "../lib/oauth-availability";

export const Route = createFileRoute("/$locale/sign-in")({
	validateSearch: (
		search: Record<string, unknown>,
	): { oauth?: string; returnTo: string; notice?: "account-deletion" } => ({
		notice:
			search.notice === "account-deletion" ? "account-deletion" : undefined,
		oauth: search.oauth === "failed" ? "failed" : "",
		returnTo: typeof search.returnTo === "string" ? search.returnTo : "",
	}),
	search: { middlewares: [stripSearchParams({ oauth: "", returnTo: "" })] },
	loader: () => getGoogleAvailability(),
	component: AuthPage,
});
function AuthPage() {
	const { locale, queryClient } = Route.useRouteContext();
	const { returnTo, oauth, notice } = Route.useSearch();
	const google = Route.useLoaderData();
	return (
		<>
			{notice && (
				<div className="max-w-sm mx-auto mb-5">
					<Notice>{accountDeletionMessages[locale].accepted}</Notice>
				</div>
			)}
			<AuthForm
				locale={locale}
				queryClient={queryClient}
				returnTo={returnTo}
				oauth={oauth}
				google={google}
			/>
		</>
	);
}
