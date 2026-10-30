import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { MessageThread } from "../components/messaging/messaging";
import { getSession } from "../lib/auth";
import { MessagingIdSchema } from "../lib/messaging-input";
export const Route = createFileRoute("/$locale/messages_/$id")({
	beforeLoad: async ({ params }) => {
		if (!MessagingIdSchema.safeParse(params.id).success) throw notFound();
		const r = await getSession();
		if (!r.ok || !r.value)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/messages/${params.id}` },
			});
		return { messagingOwner: r.value.id };
	},
	staleTime: 0,
	gcTime: 0,
	component: Page,
});
function Page() {
	const { locale, messagingOwner } = Route.useRouteContext(),
		{ id } = Route.useParams();
	return (
		<MessageThread
			key={`${messagingOwner}:${id}`}
			ownerId={messagingOwner}
			peerId={id}
			locale={locale}
		/>
	);
}
