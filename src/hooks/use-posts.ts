"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { getPosts } from "@/src/query/post.query";
import { usePostsActions, usePostsSelectors } from "@/src/store/posts.store";

interface UsePostsOptions {
	userId?: string;
	limit?: number;
	enabled?: boolean;
}

export const usePosts = (options: UsePostsOptions = {}) => {
	const { userId, limit = 10, enabled = true } = options;
	const { posts, isLoading, error, pagination, filters } = usePostsSelectors();
	const { setPosts, setLoading, setError, addPosts, setPagination } =
		usePostsActions();

	const queryKey = ["posts", { userId, limit, page: pagination.page }];

	const {
		data,
		error: queryError,
		isLoading: queryLoading,
		refetch,
	} = useQuery({
		queryKey,
		queryFn: async () => {
			const offset = (pagination.page - 1) * limit;
			return getPosts({ userId, limit, offset });
		},
		enabled: enabled && !isLoading,
	});

	useEffect(() => {
		setLoading(queryLoading);
	}, [queryLoading, setLoading]);

	useEffect(() => {
		setError(queryError?.message || null);
	}, [queryError, setError]);

	useEffect(() => {
		if (data) {
			if (pagination.page === 1) {
				setPosts(data);
			} else {
				addPosts(data);
			}
			setPagination({ hasMore: data.length === limit });
		}
	}, [data, pagination.page, setPosts, addPosts, setPagination, limit]);

	const loadMore = useCallback(() => {
		if (!pagination.hasMore || isLoading) return;
		setPagination({ page: pagination.page + 1 });
	}, [pagination.hasMore, pagination.page, isLoading, setPagination]);

	const refresh = useCallback(() => {
		setPagination({ page: 1 });
		refetch();
	}, [setPagination, refetch]);

	return {
		posts,
		isLoading,
		error,
		pagination,
		filters,
		loadMore,
		refresh,
		refetch,
	};
};

export const useUserPosts = (userId: string, enabled = true) => {
	return usePosts({ userId, enabled });
};
