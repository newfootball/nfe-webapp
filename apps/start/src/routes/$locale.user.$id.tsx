import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProfileView } from "../components/profile/profile-view";
import { getPublicProfile } from "../lib/profile";
export const Route = createFileRoute("/$locale/user/$id")({
	loader: async ({ params }) => {
		const r = await getPublicProfile({ data: { id: params.id } });
		if (!r.ok) {
			if (r.error === "invalid") throw notFound();
			throw new Error("Profile unavailable");
		}
		if (!r.value) throw notFound();
		return r.value;
	},
	staleTime: 0,
	component: Page,
});
function Page() {
	const profile = Route.useLoaderData();
	const { locale } = Route.useRouteContext();
	return <ProfileView profile={profile} locale={locale} />;
}
