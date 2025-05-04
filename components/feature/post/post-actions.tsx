"use client";

import { Button } from "@/components/ui/button";
import { hasFavorited } from "@/src/query/favorite.query";
import { hasLiked } from "@/src/query/like.query";
import { Bookmark, MessageSquare, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/src/actions/favorite.action";
import { toggleLike } from "@/src/actions/like.action";
import { useSession } from "next-auth/react";
import { PostActionShare } from "./post-actions/post-action-share";
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
	const userId = session?.user?.id;

	const [showCommentForm, setShowCommentForm] = useState(false);
	const [isLike, setIsLike] = useState(false);
	const [isFavorite, setIsFavorite] = useState(false);

	useEffect(() => {
		if (!userId) return;

		(async () => {
			const [resultLike, resultFavorite] = await Promise.all([
				hasLiked({ postId, userId }),
				hasFavorited({ postId, userId }),
			]);
			setIsLike(resultLike);
			setIsFavorite(resultFavorite);
		})();
	}, [postId, userId]);

	const handleLike = async () => {
		if (!userId) return;

		try {
			const result = await toggleLike({ postId, userId });
			setIsLike(result);
			if (result) {
				likes += 1;
			} else {
				likes -= 1;
			}
		} catch (error) {
			console.error("Error toggling like:", error);
		}
	};

	const handleFavorite = async () => {
		if (!userId) return;

		try {
			const result = await toggleFavorite({ postId, userId });
			setIsFavorite(result);
		} catch (error) {
			console.error("Error toggling favorite:", error);
		}
	};

	const handleComment = () => {
		if (!userId) return;
		setShowCommentForm(!showCommentForm);
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
					onClick={handleComment}
				>
					<MessageSquare className="mr-2 h-4 w-4" />
					<span className="hidden md:inline">Commenter</span>
				</Button>
				<PostActionShare />
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
					<PostFormComment postId={postId} />
					<PostCommentsList postId={postId} />
				</>
			)}
		</div>
	);
}
