import type { QueryClient } from "@tanstack/react-query";

const affected = new Set([
	"own-posts",
	"own-post",
	"feed",
	"post",
	"explore",
	"profile",
	"public-profile",
	"own-profile",
]);
export async function invalidatePostText(queryClient: QueryClient) {
	const filters = {
		predicate: (q: { queryKey: readonly unknown[] }) =>
			affected.has(String(q.queryKey[0])),
	};
	await queryClient.cancelQueries(filters);
	await queryClient.invalidateQueries(filters);
}
