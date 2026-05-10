import type { PostWithUserAndMedias } from "@/src/types/post.types";
import { PostActions } from "./post-actions";
import { PostContent } from "./post-content";
import { PostHeader } from "./post-header";

export const PostDetails = ({
	post,
	children,
	onCommentClick,
}: {
	post: PostWithUserAndMedias;
	children?: React.ReactNode | null;
	onCommentClick?: () => void;
}) => {
	return (
		<article
			data-post
			className="animate-fade-in-up border-b border-border bg-card"
		>
			<PostHeader post={post} />
			<PostContent post={post} />
			<PostActions
				likes={post._count.likes}
				comments={post._count.comments}
				postId={post.id}
				title={post.title}
				onCommentClick={onCommentClick}
			/>
			{children}
		</article>
	);
};
