import { Card, CardContent } from "@/components/ui/card";
import type { PostWithUserAndMedias } from "@/query/post.query";
import { PostActions } from "./post-actions";
import { PostContent } from "./post-content";
import { PostHeader } from "./post-header";

export const PostDetails = ({ post }: { post: PostWithUserAndMedias }) => {
	return (
		<Card>
			<PostHeader post={post} />
			<CardContent className="space-y-4 py-0">
				<PostContent post={post} />
				<PostActions
					likes={post._count.likes}
					comments={post._count.comments}
					postId={post.id}
				/>
			</CardContent>
		</Card>
	);
};
