import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ProfileView } from "../components/profile/profile-view";
import { getOwnProfile } from "../lib/profile";
import { profileMessages } from "../lib/profile-messages";
export const Route = createFileRoute("/$locale/profile")({
	loader: async ({ params }) => {
		const r = await getOwnProfile();
		if (!r.ok) {
			if (r.error === "unauthorized")
				throw redirect({
					to: "/$locale/sign-in",
					params: { locale: params.locale },
					search: { returnTo: `/${params.locale}/profile` },
				});
			throw new Error("Profile unavailable");
		}
		if (!r.value.initialized || !r.value.profile?.isOnboarded)
			throw redirect({
				to: "/$locale/onboarding",
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
	const t = profileMessages[locale];
	return (
		<section className="space-y-6">
			{own.profile && <ProfileView profile={own.profile} locale={locale} />}
			<nav className="flex flex-wrap gap-6">
				<Link
					to="/$locale/post/my"
					params={{ locale }}
					search={{ cursor: null }}
				>
					{locale === "fr" ? "Mes publications" : "My posts"}
				</Link>
				<Link to="/$locale/profile/edit-user" params={{ locale }}>
					{t.edit}
				</Link>
				<Link to="/$locale/user/$id" params={{ locale, id: own.id }}>
					{t.publicProfile}
				</Link>
				<Link to="/$locale/profile/account-security" params={{ locale }}>
					{t.security}
				</Link>
			</nav>
		</section>
	);
}
