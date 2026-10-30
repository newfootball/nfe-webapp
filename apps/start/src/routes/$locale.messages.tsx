import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConversationList } from "../components/messaging/messaging";
import { getSession } from "../lib/auth";
export const Route = createFileRoute("/$locale/messages")({
	beforeLoad: async ({ params }) => {
		const r = await getSession();
		if (!r.ok || !r.value)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/messages` },
			});
		return { messagingOwner: r.value.id };
	},
	staleTime: 0,
	gcTime: 0,
	component: Page,
});
function Page() {
	const { locale, messagingOwner } = Route.useRouteContext();
	return (
		<ConversationList
			key={messagingOwner}
			ownerId={messagingOwner}
			locale={locale}
		/>
	);
}
