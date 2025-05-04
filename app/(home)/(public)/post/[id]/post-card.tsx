"use client";

import { PostCommentsList } from "@/components/feature/post/post-comments-list";
import { PostDetails } from "@/components/feature/post/post-details";
import { PostFormComment } from "@/components/feature/post/post-form-comment";
import { PostWithUserAndMedias } from "@/src/types/post.types";
import { useState } from "react";

export const PostCard = ({ post }: { post: PostWithUserAndMedias }) => {
	const [refreshComments, setRefreshComments] = useState(0);

	const handleCommentPosted = () => {
		setRefreshComments((prev) => prev + 1);
	};

	return (
		<article className="flex-grow mx-auto p-4 px-0 space-y-4">
			<PostDetails post={post}>
				<PostFormComment
					postId={post.id}
					onCommentPosted={handleCommentPosted}
				/>
				<PostCommentsList postId={post.id} key={refreshComments} />
			</PostDetails>
		</article>
	);
};
