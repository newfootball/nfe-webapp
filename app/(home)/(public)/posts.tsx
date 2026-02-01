"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { PostDetails } from "@/components/feature/post/post-details";
import { usePosts } from "@/src/hooks/use-posts";
import { usePostsActions } from "@/src/store/posts.store";
import type { PostWithUserAndMedias } from "@/src/types/post.types";

export default function Posts({
	userId,
	posts: initialPosts,
}: {
	userId?: string | undefined;
	posts?: PostWithUserAndMedias[];
}) {
	const t = useTranslations("posts");
	const { setPosts } = usePostsActions();
	const { posts, isLoading, error, pagination, loadMore } = usePosts({
		userId,
	});

	useEffect(() => {
		if (initialPosts?.length) {
			setPosts(initialPosts);
		}
	}, [initialPosts, setPosts]);

	useEffect(() => {
		const handleScroll = () => {
			const postElements = document.querySelectorAll("[data-post]");
			if (postElements.length === 0) return;

			const secondToLastPost = postElements[postElements.length - 2];
			if (!secondToLastPost) return;

			const rect = secondToLastPost.getBoundingClientRect();
			const isVisible = rect.top <= window.innerHeight;

			if (isVisible && pagination.hasMore && !isLoading) {
				loadMore();
			}
		};

		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, [pagination.hasMore, isLoading, loadMore]);

	return (
		<div className="space-y-4">
			{error && (
				<div className="text-red-500 p-4 rounded-md bg-red-50">{error}</div>
			)}
			{posts.length === 0 && !isLoading && !error ? (
				<div className="text-center py-8 text-gray-500">
					{t("no-posts-available")}
				</div>
			) : (
				posts.map((post) => <PostDetails key={post.id} post={post} />)
			)}
			{isLoading && (
				<div className="text-center py-4 text-gray-500">{t("loading")}</div>
			)}
		</div>
	);
}
