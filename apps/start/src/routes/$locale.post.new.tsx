import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/$locale/post/new")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/$locale/publish",
			params: { locale: params.locale },
		});
	},
});
