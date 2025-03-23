import { PostCommentsList } from "@/components/feature/post/post-comments-list";
import { PostDetails } from "@/components/feature/post/post-details";
import { PostFormComment } from "@/components/feature/post/post-form-comment";
import type { PostWithUserAndMedias } from "@/src/query/post.query";

export const PostCard = ({ post }: { post: PostWithUserAndMedias }) => {
	return (
		<article className="flex-grow mx-auto p-4 px-0 space-y-4">
			<PostDetails post={post}>
				<PostFormComment postId={post.id} userId={post.user.id} />
				<PostCommentsList postId={post.id} />
			</PostDetails>
		</article>
	);
};
