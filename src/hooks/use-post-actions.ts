"use client";

import { useCallback } from "react";
import { toggleFavorite } from "@/src/actions/favorite.action";
import { toggleLike } from "@/src/actions/like.action";
import { usePostsActions } from "@/src/store/posts.store";

export const usePostActions = (postId: string) => {
	const { likePost, unlikePost, updatePost } = usePostsActions();

	const handleLike = useCallback(async () => {
		try {
			const result = await toggleLike({ postId });

			if (result) {
				likePost(postId);
			} else {
				unlikePost(postId);
			}

			return result;
		} catch (error) {
			console.error("Error toggling like:", error);
			return false;
		}
	}, [postId, likePost, unlikePost]);

	const handleFavorite = useCallback(async () => {
		try {
			return await toggleFavorite({ postId });
		} catch (error) {
			console.error("Error toggling favorite:", error);
			return false;
		}
	}, [postId]);

	const handleUpdatePost = useCallback(
		(
			updates: Partial<import("@/src/types/post.types").PostWithUserAndMedias>,
		) => {
			updatePost(postId, updates);
		},
		[postId, updatePost],
	);

	return {
		handleLike,
		handleFavorite,
		handleUpdatePost,
	};
};
