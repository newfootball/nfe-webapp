"use client";

import { Button } from "@/components/ui/button";
import { hasFavorited } from "@/src/query/favorite.query";
import { hasLiked } from "@/src/query/like.query";
import { Bookmark, MessageSquare, Share2, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/src/actions/favorite.action";
import { toggleLike } from "@/src/actions/like.action";
import { useSession } from "next-auth/react";
import { PostCommentsList } from "./post-comments-list";
import { PostFormComment } from "./post-form-comment";

interface PostActionsProps {
	likes?: number;
	comments?: number;
	postId: string;
}

export function PostActions({
	likes = 0,
	comments = 0,
	postId,
}: PostActionsProps) {
	const { data: session } = useSession();
	console.log({ session });
	const userId = session?.user?.id;

	if (!userId) throw new Error("User not found");

	const [showCommentForm, setShowCommentForm] = useState(false);
	const [isLike, setIsLike] = useState(false);
	const [isFavorite, setIsFavorite] = useState(false);

	useEffect(() => {
		(async () => {
			const [resultLike, resultFavorite] = await Promise.all([
				hasLiked({ postId, userId }),
				hasFavorited({ postId, userId }),
			]);
			console.log({ resultLike, resultFavorite });

			setIsLike(resultLike);
			setIsFavorite(resultFavorite);
		})();
	}, [postId, userId]);

	const handleLike = () => {
		toggleLike({ postId, userId }).then((result: boolean) => {
			setIsLike(result);
			if (result) {
				likes += 1;
			} else {
				likes -= 1;
			}
		});
	};

	const handleFavorite = () => {
		toggleFavorite({ postId, userId }).then((result: boolean) => {
			setIsFavorite(result);
		});
	};

	return (
		<div className="px- py-2">
			{(likes > 0 || comments > 0) && (
				<div className="flex items-center justify-between border-b py-2 text-sm text-muted-foreground">
					<div className="flex items-center gap-1">
						<ThumbsUp className="h-4 w-4 fill-current" />
						<span>{likes}</span>
					</div>
					{comments > 0 && (
						<Link href={`/post/${postId}`}>{comments} commentaires</Link>
					)}
				</div>
			)}
			<div className="flex items-center justify-between pt-2 sm:space-x-2">
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={handleLike}
				>
					<ThumbsUp
						className={cn("mr-2 h-4 w-4", {
							"fill-current": isLike,
						})}
					/>
					<span className="hidden md:inline">J&apos;aime</span>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={() => setShowCommentForm(!showCommentForm)}
				>
					<MessageSquare className="mr-2 h-4 w-4" />
					<span className="hidden md:inline">Commenter</span>
				</Button>
				<Button variant="ghost" size="sm" className="flex-1">
					<Share2 className="mr-2 h-4 w-4" />
					<span className="hidden md:inline">Partager</span>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={handleFavorite}
				>
					<Bookmark
						className={cn("mr-2 h-4 w-4", { "fill-current": isFavorite })}
					/>
					<span className="hidden md:inline">Enregistrer</span>
				</Button>
			</div>
			{showCommentForm && (
				<>
					<PostFormComment postId={postId} userId={userId} />
					<PostCommentsList postId={postId} />
				</>
			)}
		</div>
	);
}
