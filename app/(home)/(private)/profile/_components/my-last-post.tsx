"use client";

import { getPosts } from "@/src/query/post.query";
import { useQuery } from "@tanstack/react-query";
import { LastPostBox } from "./last-post-box";

export const MyLastPost = ({ userId }: { userId: string }) => {
	const { data: myPosts, isLoading } = useQuery({
		queryKey: ["my-last-post", userId],
		queryFn: () => getPosts({ userId: userId }),
	});

	return (
		<LastPostBox
			posts={myPosts}
			count={myPosts?.length}
			title="Mes derniers posts"
			isLoading={isLoading}
		/>
	);
};
