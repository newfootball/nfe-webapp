import { PostDetails } from "@/components/feature/post/post-details";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { PostWithUserAndMedias } from "@/query/post.query";

export const PostCard = ({ post }: { post: PostWithUserAndMedias }) => {
	return (
		<article className="flex-grow mx-auto p-4 space-y-4">
			<PostDetails post={post} />

			<div className="space-y-3">
				<div className="flex items-start space-x-3">
					<Avatar className="w-8 h-8">
						<AvatarImage src="/placeholder.svg" alt="Jane Doe" />
						<AvatarFallback>JD</AvatarFallback>
					</Avatar>
					<div>
						<p>
							<span className="font-semibold">{post.user.name}</span>{" "}
							{post.description}
						</p>
						<div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
							<span>2d</span>
							<span>23 likes</span>
							<Button variant="link" className="p-0 h-auto text-xs">
								Reply
							</Button>
						</div>
					</div>
				</div>
				<div className="flex items-start space-x-3">
					<Avatar className="w-8 h-8">
						<AvatarImage src="/placeholder.svg" alt="John Smith" />
						<AvatarFallback>JS</AvatarFallback>
					</Avatar>
					<div>
						<p>
							<span className="font-semibold">john_smith</span> Paradise indeed!
							Have a great time!
						</p>
						<div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
							<span>1d</span>
							<span>15 likes</span>
							<Button variant="link" className="p-0 h-auto text-xs">
								Reply
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="flex items-center space-x-3 pt-4 border-t">
				<Avatar className="w-8 h-8">
					<AvatarImage src="/placeholder.svg" alt="Your Avatar" />
					<AvatarFallback>YA</AvatarFallback>
				</Avatar>
				<input
					type="text"
					placeholder="Add a comment..."
					className="flex-grow bg-transparent text-sm focus:outline-none"
				/>
				<Button variant="ghost" className="text-primary">
					Post
				</Button>
			</div>
		</article>
	);
};
