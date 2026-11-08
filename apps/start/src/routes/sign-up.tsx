import { createFileRoute, notFound } from "@tanstack/react-router";
import { AuthForm } from "../components/auth-form";
import { authMessages } from "../lib/auth-messages";
import { getGoogleAvailability } from "../lib/oauth-availability";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>): { returnTo?: string } => {
		if (search.returnTo === undefined) return {};
		if (typeof search.returnTo !== "string") throw notFound();
		return { returnTo: search.returnTo };
	},
	loader: async () => {
		const [context, google] = await Promise.all([
			getPublicPageContext(),
			getGoogleAvailability(),
		]);
		return { ...context, google };
	},
	head: ({ loaderData }) =>
		loaderData
			? publicHead(
					loaderData.origin,
					"/sign-up",
					loaderData.locale,
					authMessages[loaderData.locale].signUp,
					authMessages[loaderData.locale].signUp,
				)
			: {},
	component: SignUpPage,
});
function SignUpPage() {
	const { locale, google } = Route.useLoaderData();
	const { queryClient } = Route.useRouteContext();
	const { returnTo } = Route.useSearch();
	return (
		<main className="px-6 py-8 sm:py-14">
			<AuthForm
				locale={locale}
				queryClient={queryClient}
				returnTo={returnTo}
				google={google}
				initialSignup
			/>
		</main>
	);
}
