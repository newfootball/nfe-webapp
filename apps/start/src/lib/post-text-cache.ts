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
	"interactions",
	"comments",
	"favorites",
	"post-lifecycle",
]);
export async function invalidatePostText(queryClient: QueryClient) {
	const filters = {
		predicate: (q: { queryKey: readonly unknown[] }) =>
			affected.has(String(q.queryKey[0])),
	};
	await queryClient.cancelQueries(filters);
	await queryClient.invalidateQueries(filters);
}

// Withdrawal/replacement must also evict inactive variants: ensureQueryData can
// otherwise reuse an invalidated cached detail before an asynchronous refresh.
export async function clearPostLifecycleCache(queryClient: QueryClient) {
	const filters = {
		predicate: (q: { queryKey: readonly unknown[] }) =>
			affected.has(String(q.queryKey[0])),
	};
	await queryClient.cancelQueries(filters);
	queryClient.removeQueries(filters);
}
