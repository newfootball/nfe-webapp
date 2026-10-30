import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PostTextForm } from "../components/posts/post-text-form";
import { getOwnPost } from "../lib/post-text";
import { postTextMessages } from "../lib/post-text-messages";
import { privatePostTextResponse } from "../lib/post-text-response";
export const Route = createFileRoute("/$locale/post_/$id/edit")({
	server: { middleware: [privatePostTextResponse] },
	loader: async ({ params }) => {
		const result = await getOwnPost({ data: { id: params.id } });
		if (!result.ok && result.error === "unauthorized")
			throw redirect({
				headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/post/${params.id}/edit` },
			});
		return result;
	},
	headers: () => ({ "Cache-Control": "private, no-store", Vary: "Cookie" }),
	staleTime: 0,
	gcTime: 0,
	preload: false,
	component: Page,
});
function Page() {
	const result = Route.useLoaderData(),
		{ locale } = Route.useRouteContext(),
		t = postTextMessages[locale];
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-bold">{t.edit}</h1>
			<nav className="flex gap-6 underline">
				<Link
					to="/$locale/post/my"
					params={{ locale }}
					search={{ cursor: null }}
				>
					{t.mine}
				</Link>
				<Link
					to="/$locale/post/$id/edit"
					params={{
						locale: locale === "fr" ? "en" : "fr",
						id: Route.useParams().id,
					}}
				>
					{t.language}
				</Link>
			</nav>
			{result.ok ? (
				<PostTextForm
					key={`${result.value.userId}:${result.value.id}`}
					post={result.value}
					locale={locale}
				/>
			) : (
				<p role="alert">{t.errors[result.error]}</p>
			)}
		</section>
	);
}
