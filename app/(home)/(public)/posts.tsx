"use client";

import { PostDetails } from "@/components/feature/post/post-details";
import { getPosts } from "@/src/query/post.query";
import type { PostWithUserAndMedias } from "@/src/types/post.types";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function Posts({
	userId,
	posts: initialPosts,
}: {
	userId?: string | undefined;
	posts?: PostWithUserAndMedias[];
}) {
	const [posts, setPosts] = useState<PostWithUserAndMedias[]>(
		initialPosts ?? [],
	);
	const [offset, setOffset] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const limit = 10;
	const t = useTranslations("posts");

	useEffect(() => {
		const fetchPosts = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const newOffset = offset + limit;
				const newPosts = await getPosts({
					userId,
					offset: newOffset,
					limit,
				});

				if (newPosts.length > 0) {
					setPosts((prev) => [...prev, ...newPosts]);
					setOffset(newOffset);
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : t("failed-to-fetch-posts"),
				);
				console.error("Error fetching posts:", err);
			} finally {
				setIsLoading(false);
			}
		};

		const handleScroll = async () => {
			const postElements = document.querySelectorAll("[data-post]");
			if (postElements.length === 0) return;

			const secondToLastPost = postElements[postElements.length - 2];
			if (!secondToLastPost) return;

			const rect = secondToLastPost.getBoundingClientRect();
			const isVisible = rect.top <= window.innerHeight;

			if (isVisible && posts.length >= limit) {
				console.warn("fetching posts");
				//fetchPosts();
			}
		};

		if (posts.length === 0) fetchPosts();

		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, [offset, posts.length, userId, t]);

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
