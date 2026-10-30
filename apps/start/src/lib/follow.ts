import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { changeFollow, readFollowState, readOwnFollows } from "./follow.server";
import {
	validateFollowList,
	validateFollowState,
	validateFollowTarget,
} from "./follow-input";
export const getFollowState = createServerFn({ method: "GET" })
	.validator(validateFollowTarget)
	.handler(({ data }) => readFollowState(data));
export const setFollowing = createServerFn({ method: "POST" })
	.validator(validateFollowState)
	.handler(({ data }) => changeFollow(data));
export const getOwnFollows = createServerFn({ method: "GET" })
	.validator(validateFollowList)
	.handler(({ data }) => readOwnFollows(data));
export const followOptions = (id: string) =>
	queryOptions({
		queryKey: ["follows", "state", id],
		queryFn: async () => {
			const r = await getFollowState({ data: { id } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		staleTime: 0,
		retry: false,
	});
export const ownFollowsOptions = (direction: "followers" | "following") =>
	infiniteQueryOptions({
		queryKey: ["follows", "own", direction],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }) => {
			const r = await getOwnFollows({ data: { direction, cursor: pageParam } });
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		getNextPageParam: (page) => page.nextCursor,
		staleTime: 0,
		gcTime: 0,
		retry: false,
	});
