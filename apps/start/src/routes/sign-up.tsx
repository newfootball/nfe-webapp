import { createFileRoute, notFound } from "@tanstack/react-router";
import { AuthForm } from "../components/auth-form";
import { authMessages } from "../lib/auth-messages";
import { getPublicPageContext } from "../lib/public-pages";
import { publicHead } from "../lib/seo";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>): { returnTo?: string } => {
		if (search.returnTo === undefined) return {};
		if (typeof search.returnTo !== "string") throw notFound();
		return { returnTo: search.returnTo };
	},
	loader: () => getPublicPageContext(),
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
	const { locale } = Route.useLoaderData();
	const { queryClient } = Route.useRouteContext();
	const { returnTo } = Route.useSearch();
	return (
		<main className="mx-auto max-w-md p-8">
			<AuthForm
				locale={locale}
				queryClient={queryClient}
				returnTo={returnTo}
				initialSignup
			/>
		</main>
	);
}
