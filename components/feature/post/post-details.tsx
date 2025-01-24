import { Card, CardContent } from "@/components/ui/card";
import type { PostWithUserAndMedias } from "@/src/query/post.query";
import { PostActions } from "./post-actions";
import { PostContent } from "./post-content";
import { PostHeader } from "./post-header";

export const PostDetails = ({
	post,
	children,
}: {
	post: PostWithUserAndMedias;
	children?: React.ReactNode | null;
}) => {
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
				{children}
			</CardContent>
		</Card>
	);
};
