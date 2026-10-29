import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { readExplore, readFeed, readPost } from "./feed.server";
import {
	DetailRequestSchema,
	type ExploreRequest,
	ExploreRequestSchema,
	type FeedRequest,
	FeedRequestSchema,
} from "./feed-input";
export const getFeed = createServerFn({ method: "GET" })
	.validator((v: unknown) => FeedRequestSchema.parse(v))
	.handler(({ data }) => readFeed(data));
export const getPost = createServerFn({ method: "GET" })
	.validator((v: unknown) => DetailRequestSchema.parse(v))
	.handler(({ data }) => readPost(data.id));
export const getExplore = createServerFn({ method: "GET" })
	.validator((v: unknown) => ExploreRequestSchema.parse(v))
	.handler(({ data }) => readExplore(data));
export function feedOptions(locale: string, input: Partial<FeedRequest> = {}) {
	const request = FeedRequestSchema.parse(input);
	return infiniteQueryOptions({
		queryKey: [
			"feed",
			locale,
			request.authorId ?? null,
			request.q,
			request.limit,
			"public",
		],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }) => {
			const result = await getFeed({ data: { ...request, cursor: pageParam } });
			if (!result.ok) throw new Error(result.error);
			return result.value;
		},
		getNextPageParam: (page) => page.nextCursor,
		staleTime: 30_000,
		retry: false,
		networkMode: "always",
		refetchOnReconnect: false,
	});
}
export const postOptions = (locale: string, id: string) =>
	queryOptions({
		queryKey: ["post", locale, id, "public"],
		queryFn: async () => {
			const r = await getPost({ data: { id } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		staleTime: 30_000,
		retry: false,
		networkMode: "always",
		refetchOnReconnect: false,
	});
// Personalized suggestions are private, removed on identity changes by clearIdentityCache.
export const exploreOptions = (locale: string, input: ExploreRequest) =>
	queryOptions({
		queryKey: ["explore", locale, input.q, input.tab],
		queryFn: async () => {
			const r = await getExplore({ data: input });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		staleTime: 30_000,
		retry: false,
		networkMode: "always",
		refetchOnReconnect: false,
	});
