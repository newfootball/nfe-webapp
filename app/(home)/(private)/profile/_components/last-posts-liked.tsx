"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { LastPostBox } from "./last-post-box";
import {
  lastPostsLikedQuery,
  lastPostsLikedQueryCount,
} from "./last-posts-liked.query";

const MAX_POSTS = 3;

export const LastPostsLiked = ({ userId }: { userId: string }) => {
  const t = useTranslations("profile");
  const { data: myPosts, isLoading } = useQuery({
    queryKey: ["last-posts-liked", userId],
    queryFn: () => lastPostsLikedQuery({ userId: userId, limit: MAX_POSTS }),
  });
  const { data: count } = useQuery({
    queryKey: ["last-posts-liked-count", userId],
    queryFn: () => lastPostsLikedQueryCount(userId),
  });

  return (
    <LastPostBox
      posts={myPosts ?? []}
      count={count}
      title={t("last-liked-posts")}
      isLoading={isLoading}
    />
  );
};
