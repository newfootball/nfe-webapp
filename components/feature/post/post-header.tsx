import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";
import type { PostWithUserAndMedias } from "@/src/query/post.query";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, X } from "lucide-react";
import Link from "next/link";

interface PostHeaderProps {
	post: PostWithUserAndMedias;
}

export function PostHeader({ post }: PostHeaderProps) {
	return (
		<>
			<CardTitle className="leading-none tracking-tight px-4">
				<div className="flex items-start justify-between p-4 pb-2 border-b mx-4 text-gray-500 font-light text-sm">
					<div>Suggestion</div>
					<div className="flex items-center gap-2">
						<Link href={`/post/${post.id}`}>
							<MoreHorizontal className="h-4 w-4" />
						</Link>
						<Button variant="ghost" size="icon">
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</CardTitle>
			<CardHeader className="flex-row items-center space-x-4 py-2 space-y-0 pb-4">
				<div className="flex items-start space-y-2 text-left">
					<Avatar className="flex h-14 w-14">
						<AvatarImage
							src={post.user?.image ?? ""}
							alt={post.user.name ?? ""}
						/>
						<AvatarFallback>
							{post.user?.name?.[0]?.toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col pl-4">
						<Link
							href={`/user/${post.user.id}`}
							className="font-semibold hover:underline"
						>
							{post.user.name}
						</Link>
						<span className="text-xs text-muted-foreground">
							{formatDistanceToNow(new Date(post.createdAt), {
								addSuffix: true,
							})}
						</span>
						{post.user.localisation && (
							<p className="text-sm text-muted-foreground">
								{post.user.localisation}
							</p>
						)}
					</div>
				</div>
			</CardHeader>
		</>
	);
}
