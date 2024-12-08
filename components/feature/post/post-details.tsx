import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PostWithUserAndMedias } from "@/query/post.query";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";

export const PostDetails = ({ post }: { post: PostWithUserAndMedias }) => {
	const image = post.medias.find((media) => media.mimetype.includes("image"));
	const video = post.medias.find((media) => media.mimetype.includes("video"));

	console.log(post.medias);

	return (
		<Card>
			<CardHeader className="flex-row items-center space-x-4 space-y-0 pb-4">
				<Avatar>
					<AvatarImage
						src={post.user?.image ?? ""}
						alt={post.user.name ?? ""}
					/>
					<AvatarFallback>{post.user?.name?.[0]?.toUpperCase()}</AvatarFallback>
				</Avatar>
				<div className="flex-1">
					<div className="flex items-center justify-between">
						<Link
							href={`/user/${post.user.id}`}
							className="font-semibold hover:underline"
						>
							{post.user.name}
						</Link>
						<span className="text-sm text-muted-foreground">
							{formatDistanceToNow(new Date(post.createdAt), {
								addSuffix: true,
							})}
						</span>
					</div>
					{post.user.localisation && (
						<p className="text-sm text-muted-foreground">
							{post.user.localisation}
						</p>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{video && (
					<div className="relative aspect-video overflow-hidden rounded-lg">
						<Link href={`/post/${post.id}`}>
							<video
								muted={false}
								className="w-full h-full object-cover"
								poster={image?.url}
								controls={false}
								autoPlay={false}
							>
								<source src={video.url} type={video.mimetype} />
							</video>
						</Link>
					</div>
				)}
				<div>
					<h3 className="font-semibold">{post.title}</h3>
				</div>
				<div className="flex items-center space-x-4 pt-4">
					<Button
						variant="link"
						className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
					>
						<Heart className="h-5 w-5" />
						<span className="text-sm">Like</span>
					</Button>
					<Button
						variant="link"
						className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
					>
						<MessageCircle className="h-5 w-5" />
						<span className="text-sm">Comment</span>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};
