"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getPostsWithCursor } from "@/src/query/post.query";
import { usePostsActions } from "@/src/store/posts.store";
import type { PostsPage } from "@/src/types/post.types";

interface UsePostsOptions {
	userId?: string;
	limit?: number;
	enabled?: boolean;
	initialData?: PostsPage;
}

export const usePosts = (options: UsePostsOptions = {}) => {
	const { userId, limit = 10, enabled = true, initialData } = options;
	const { setPosts } = usePostsActions();

	const {
		data,
		error,
		isLoading,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
		refetch,
	} = useInfiniteQuery({
		queryKey: ["posts", { userId }],
		queryFn: ({ pageParam }) =>
			getPostsWithCursor({ userId, cursor: pageParam, limit }),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		enabled,
		...(initialData && {
			initialData: {
				pages: [initialData],
				pageParams: [null],
			},
		}),
	});

	const posts = data?.pages.flatMap((page) => page.posts) ?? [];

	useEffect(() => {
		const flatPosts = data?.pages.flatMap((page) => page.posts) ?? [];
		if (flatPosts.length > 0) {
			setPosts(flatPosts);
		}
	}, [data, setPosts]);

	return {
		posts,
		isLoading,
		isFetchingNextPage,
		error: error?.message ?? null,
		hasNextPage: hasNextPage ?? false,
		fetchNextPage,
		refetch,
	};
};

export const useUserPosts = (userId: string, enabled = true) => {
	return usePosts({ userId, enabled });
};
