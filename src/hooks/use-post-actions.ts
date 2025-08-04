"use client";

import { toggleFavorite } from "@/src/actions/favorite.action";
import { toggleLike } from "@/src/actions/like.action";
import { usePostsActions } from "@/src/store/posts.store";
import { useCallback } from "react";

export const usePostActions = (postId: string, userId?: string) => {
  const { likePost, unlikePost, updatePost } = usePostsActions();

  const handleLike = useCallback(async () => {
    if (!userId) return false;

    try {
      const result = await toggleLike({ postId, userId });

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
  }, [postId, userId, likePost, unlikePost]);

  const handleFavorite = useCallback(async () => {
    if (!userId) return false;

    try {
      return await toggleFavorite({ postId, userId });
    } catch (error) {
      console.error("Error toggling favorite:", error);
      return false;
    }
  }, [postId, userId]);

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
