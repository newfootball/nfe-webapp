"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { PostDetails } from "@/components/feature/post/post-details";
import {
	PostSkeleton,
	PostSkeletonList,
} from "@/components/feature/post/post-skeleton";
import { usePosts } from "@/src/hooks/use-posts";
import type { PostsPage } from "@/src/types/post.types";

export default function Posts({
	userId,
	initialData,
}: {
	userId?: string;
	initialData?: PostsPage;
}) {
	const t = useTranslations("posts");
	const {
		posts,
		isLoading,
		isFetchingNextPage,
		error,
		hasNextPage,
		fetchNextPage,
	} = usePosts({ userId, initialData });

	const { ref, inView } = useInView({ threshold: 0 });

	useEffect(() => {
		if (inView && hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

	if (isLoading) {
		return <PostSkeletonList />;
	}

	return (
		<div>
			{error && (
				<div className="text-destructive p-4 rounded-md bg-destructive/10">
					{error}
				</div>
			)}
			{posts.length === 0 && !error ? (
				<div className="text-center py-8 text-muted-foreground">
					{t("no-posts-available")}
				</div>
			) : (
				posts.map((post) => <PostDetails key={post.id} post={post} />)
			)}
			{isFetchingNextPage && <PostSkeleton />}
			{!hasNextPage && posts.length > 0 && (
				<div className="text-center py-6 text-sm text-muted-foreground">
					{t("no-more-posts")}
				</div>
			)}
			<div ref={ref} className="h-1" />
		</div>
	);
}
