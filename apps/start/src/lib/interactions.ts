import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import {
	changeInteraction,
	createComment,
	readComments,
	readFavorites,
	readInteractionState,
	removeComment,
} from "./interactions.server";
import {
	validateCommentCreate,
	validateCommentDelete,
	validateFavoritePage,
	validateInteractionPage,
	validateInteractionPair,
	validateInteractionTarget,
} from "./interactions-input";
export const getInteractionState = createServerFn({ method: "GET" })
	.validator(validateInteractionTarget)
	.handler(({ data }) => readInteractionState(data));
export const setInteraction = createServerFn({ method: "POST" })
	.validator(validateInteractionPair)
	.handler(({ data }) => changeInteraction(data));
export const addComment = createServerFn({ method: "POST" })
	.validator(validateCommentCreate)
	.handler(({ data }) => createComment(data));
export const deletePostComment = createServerFn({ method: "POST" })
	.validator(validateCommentDelete)
	.handler(({ data }) => removeComment(data));
export const getComments = createServerFn({ method: "GET" })
	.validator(validateInteractionPage)
	.handler(({ data }) => readComments(data));
export const getFavorites = createServerFn({ method: "GET" })
	.validator(validateFavoritePage)
	.handler(({ data }) => readFavorites(data));
export const interactionOptions = (id: string) =>
	queryOptions({
		queryKey: ["interactions", "state", id],
		queryFn: async ({ signal }) => {
			const r = await getInteractionState({ data: { id } });
			signal.throwIfAborted();
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		staleTime: 0,
		gcTime: 0,
		retry: false,
	});
export const commentsOptions = (id: string) =>
	infiniteQueryOptions({
		queryKey: ["interactions", "comments", id],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam, signal }) => {
			const r = await getComments({ data: { id, cursor: pageParam } });
			signal.throwIfAborted();
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		getNextPageParam: (p) => p.nextCursor,
		staleTime: 0,
		gcTime: 0,
		retry: false,
	});
export const favoritesOptions = () =>
	infiniteQueryOptions({
		queryKey: ["interactions", "favorites"],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam, signal }) => {
			const r = await getFavorites({ data: { cursor: pageParam } });
			signal.throwIfAborted();
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		getNextPageParam: (p) => p.nextCursor,
		staleTime: 0,
		gcTime: 0,
		retry: false,
	});
