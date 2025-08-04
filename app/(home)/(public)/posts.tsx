"use client";

import { PostDetails } from "@/components/feature/post/post-details";
import { getPosts } from "@/src/query/post.query";
import type { PostWithUserAndMedias } from "@/src/types/post.types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export default function Posts({
  userId,
  posts: initialPosts = [],
}: {
  userId?: string | undefined;
  posts?: PostWithUserAndMedias[];
}) {
  const t = useTranslations("posts");

  const {
    data: posts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["posts", { userId }],
    queryFn: () => getPosts({ userId }),
    initialData: initialPosts,
  });

  if (error) {
    return (
      <div className="text-red-500 p-4 rounded-md bg-red-50">
        {t("failed-to-fetch-posts")}
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-4 text-gray-500">{t("loading")}</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {t("no-posts-available")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostDetails key={post.id} post={post} />
      ))}
    </div>
  );
}
