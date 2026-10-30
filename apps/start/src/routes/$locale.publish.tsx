import {
	createFileRoute,
	redirect,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { Button } from "../../../../components/ui/button";
import { PublishForm } from "../components/media/publish-form";
import { getSession } from "../lib/auth";
import { mediaMessages } from "../lib/media-messages";
export const Route = createFileRoute("/$locale/publish")({
	loader: async ({ params }) => {
		const result = await getSession();
		if (!result.ok) throw new Error("Session unavailable");
		if (!result.value)
			throw redirect({
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/publish` },
			});
		return result.value;
	},
	staleTime: 0,
	gcTime: 0,
	headers: () => ({ "Cache-Control": "private, no-store" }),
	pendingComponent: Pending,
	errorComponent: Failure,
	component: Page,
});
function Page() {
	const currentViewer = Route.useLoaderData();
	const { locale } = Route.useRouteContext();
	return (
		<PublishForm
			key={currentViewer.id}
			viewerId={currentViewer.id}
			locale={locale}
		/>
	);
}

function useLocale() {
	return useRouterState({
		select: (state) =>
			state.location.pathname.startsWith("/en/")
				? ("en" as const)
				: ("fr" as const),
	});
}
function Pending() {
	return <p role="status">{mediaMessages[useLocale()].pageLoading}</p>;
}
function Failure() {
	const t = mediaMessages[useLocale()],
		router = useRouter();
	return (
		<section role="alert" className="flex flex-col items-start gap-4">
			<p>{t.errors.unavailable}</p>
			<Button onClick={() => router.invalidate()}>{t.retry}</Button>
		</section>
	);
}
