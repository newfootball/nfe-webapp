import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProfileForm } from "../components/profile/profile-form";
import { getOwnProfile } from "../lib/profile";
export const Route = createFileRoute("/$locale/onboarding")({
	loader: async ({ params }) => {
		const r = await getOwnProfile();
		if (!r.ok) {
			if (r.error === "unauthorized")
				throw redirect({
					to: "/$locale/sign-in",
					params: { locale: params.locale },
					search: { returnTo: `/${params.locale}/onboarding` },
				});
			throw new Error("Profile unavailable");
		}
		if (r.value.initialized && r.value.profile?.isOnboarded)
			throw redirect({
				to: "/$locale/profile",
				params: { locale: params.locale },
			});
		return r.value;
	},
	staleTime: 0,
	gcTime: 0,
	component: Page,
});
function Page() {
	const own = Route.useLoaderData();
	const { locale } = Route.useRouteContext();
	return <ProfileForm own={own} locale={locale} />;
}
