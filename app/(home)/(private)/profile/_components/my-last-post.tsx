"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getPosts } from "@/src/query/post.query";
import { LastPostBox } from "./last-post-box";

export const MyLastPost = ({ userId }: { userId: string }) => {
	const t = useTranslations("profile");
	const { data: myPosts, isLoading } = useQuery({
		queryKey: ["my-last-post", userId],
		queryFn: () => getPosts({ userId: userId }),
	});

	return (
		<LastPostBox
			posts={myPosts}
			count={myPosts?.length}
			title={t("my-last-posts")}
			isLoading={isLoading}
		/>
	);
};
