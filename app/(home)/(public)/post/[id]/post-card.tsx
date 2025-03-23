"use client";

import { PostCommentsList } from "@/components/feature/post/post-comments-list";
import { PostDetails } from "@/components/feature/post/post-details";
import { PostFormComment } from "@/components/feature/post/post-form-comment";
import type { PostWithUserAndMedias } from "@/src/query/post.query";
import { useState } from "react";

export const PostCard = ({ post }: { post: PostWithUserAndMedias }) => {
	// État pour forcer le rafraîchissement des commentaires
	const [refreshComments, setRefreshComments] = useState(0);

	// Fonction pour déclencher le rafraîchissement
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
