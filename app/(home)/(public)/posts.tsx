"use client";

import { PostDetails } from "@/components/feature/post/post-details";
import type { PostWithUserAndMedias } from "@/query/post.query";
import { getPosts } from "@/query/post.query";
import { useEffect, useState } from "react";

export default function Posts({ userId }: { userId?: string | undefined }) {
	const [posts, setPosts] = useState<PostWithUserAndMedias[]>([]);
	const [offset, setOffset] = useState(0);
	const limit = 10;

	useEffect(() => {
		const fetchPosts = async () => {
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
		};

		const handleScroll = async () => {
			const postElements = document.querySelectorAll("[data-post]");
			if (postElements.length === 0) return;

			const secondToLastPost = postElements[postElements.length - 2];
			if (!secondToLastPost) return;

			const rect = secondToLastPost.getBoundingClientRect();
			const isVisible = rect.top <= window.innerHeight;

			if (isVisible && posts.length >= limit) {
				console.log("fetching posts");
				//fetchPosts();
			}
		};

		// Fetch initial posts when component mounts
		if (posts.length === 0) fetchPosts();

		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, [offset, posts.length, userId]);

	return (
		<>
			{posts.map((post) => (
				<PostDetails key={post.id} post={post} />
			))}
		</>
	);
}
