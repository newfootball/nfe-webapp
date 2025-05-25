"use client";

import { getCommentCount, getLastComments } from "@/src/query/comment.query";
import type {
	CommentCountResult,
	LastCommentsResult,
} from "@/src/query/comment.query";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const commentKeys = {
	all: ["comments"] as const,
	count: (postId: string) => [...commentKeys.all, "count", postId] as const,
	list: (postId: string) => [...commentKeys.all, "list", postId] as const,
};

export function useCommentCount(postId: string) {
	return useQuery({
		queryKey: commentKeys.count(postId),
		queryFn: async (): Promise<CommentCountResult> => {
			return await getCommentCount(postId);
		},
		staleTime: 60 * 1000,
	});
}

export function useLastComments(postId: string, limit = 5) {
	return useQuery({
		queryKey: commentKeys.list(postId),
		queryFn: async (): Promise<LastCommentsResult> => {
			return await getLastComments(postId, limit);
		},
		staleTime: 60 * 1000,
	});
}

export function useInvalidateCommentQueries() {
	const queryClient = useQueryClient();

	return {
		invalidateCommentQueries: (postId: string) => {
			queryClient.invalidateQueries({ queryKey: commentKeys.count(postId) });
			queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
		},
	};
}
