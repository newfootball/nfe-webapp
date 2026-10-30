import { createFileRoute, notFound } from "@tanstack/react-router";
import { DirectoryPage } from "../components/public-pages/directory";
import { getDirectory } from "../lib/directory";
import { DirectorySchema, directoryTitle } from "../lib/directory-input";
import { publicHead } from "../lib/seo";
export const Route = createFileRoute("/coaches")({
	validateSearch: (search: Record<string, unknown>): { page?: number } => {
		if (search.page === undefined) return {};
		const page = Number(search.page);
		if (!Number.isInteger(page) || page < 1 || page > 50) throw notFound();
		return { page };
	},
	loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
	loader: async ({ deps }) => {
		const input = DirectorySchema.safeParse({
			type: "coaches",
			position: undefined,
			city: undefined,
			page: deps.page,
		});
		if (!input.success) throw notFound();
		const result = await getDirectory({ data: input.data });
		if (deps.page > 1 && !result.users.length) throw notFound();
		const title = directoryTitle(result.locale, input.data);
		return { ...result, title, page: deps.page };
	},
	head: ({ loaderData }) =>
		loaderData
			? publicHead(
					loaderData.origin,
					"/coaches" + (loaderData.page > 1 ? `?page=${loaderData.page}` : ""),
					loaderData.locale,
					loaderData.title,
					loaderData.title + " — Next Football Experience",
				)
			: {},
	component: Page,
});
function Page() {
	const data = Route.useLoaderData();
	return <DirectoryPage data={data} title={data.title} page={data.page} />;
}
