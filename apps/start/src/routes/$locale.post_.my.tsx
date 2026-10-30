import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getOwnPosts } from "../lib/post-text";
import { OwnPostsSchema } from "../lib/post-text-input";
import { postTextMessages } from "../lib/post-text-messages";
import { privatePostTextResponse } from "../lib/post-text-response";

export const Route = createFileRoute("/$locale/post_/my")({
	validateSearch: (search: Record<string, unknown>) => {
		const result = OwnPostsSchema.safeParse({
			limit: 10,
			cursor: typeof search.cursor === "string" ? search.cursor : null,
		});
		return result.success ? { cursor: result.data.cursor } : { cursor: null };
	},
	loaderDeps: ({ search }) => search,
	server: { middleware: [privatePostTextResponse] },
	loader: async ({ params, deps }) => {
		const result = await getOwnPosts({
			data: { limit: 10, cursor: deps.cursor },
		});
		if (!result.ok && result.error === "unauthorized")
			throw redirect({
				headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
				to: "/$locale/sign-in",
				params: { locale: params.locale },
				search: { returnTo: `/${params.locale}/post/my` },
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
			<h1 className="text-3xl font-bold">{t.mine}</h1>
			<nav className="flex gap-6 underline">
				<Link
					to="/$locale/post/my"
					params={{ locale: locale === "fr" ? "en" : "fr" }}
					search={{ cursor: null }}
				>
					{t.language}
				</Link>
				<Link to="/$locale/profile" params={{ locale }}>
					{locale === "fr" ? "Mon profil" : "My profile"}
				</Link>
			</nav>
			{!result.ok ? (
				<p role="alert">{t.errors[result.error]}</p>
			) : (
				<>
					{result.value.posts.length === 0 && <p>{t.empty}</p>}
					<ul className="space-y-6">
						{result.value.posts.map((post) => (
							<li
								key={post.id}
								className="rounded border p-4"
								data-testid="own-post"
							>
								<h2 className="text-xl font-semibold">{post.title}</h2>
								<p>{t.statuses[post.status ?? "legacy"]}</p>
								<p className="whitespace-pre-wrap break-words">
									{post.description}
								</p>
								<Link
									className="underline"
									to="/$locale/post/$id/edit"
									params={{ locale, id: post.id }}
								>
									{t.edit}
								</Link>
							</li>
						))}
					</ul>
					<nav className="flex gap-6 underline">
						<Link
							to="/$locale/post/my"
							params={{ locale }}
							search={{ cursor: null }}
						>
							{t.first}
						</Link>
						{result.value.nextCursor && (
							<Link
								to="/$locale/post/my"
								params={{ locale }}
								search={{ cursor: result.value.nextCursor }}
							>
								{t.next}
							</Link>
						)}
					</nav>
				</>
			)}
		</section>
	);
}
