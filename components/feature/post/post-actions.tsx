"use client";

import { Button } from "@/components/ui/button";
import { hasFavorited } from "@/query/favorite.query";
import { hasLiked } from "@/query/like.query";
import { Bookmark, MessageSquare, Share2, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { toggleFavorite } from "@/actions/favorite.action";
import { toggleLike } from "@/actions/like.action";
import { cn } from "@/lib/utils";

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
	const [showCommentForm, setShowCommentForm] = useState(false);
	const [isLike, setIsLike] = useState(false);
	const [isFavorite, setIsFavorite] = useState(false);

	useEffect(() => {
		(async () => {
			const [resultLike, resultFavorite] = await Promise.all([
				hasLiked({ postId }),
				hasFavorited({ postId }),
			]);
			console.log({ resultLike, resultFavorite });

			setIsLike(resultLike);
			setIsFavorite(resultFavorite);
		})();
	}, [postId]);

	const handleLike = () => {
		toggleLike({ postId }).then((result: boolean) => {
			setIsLike(result);
			if (result) {
				likes += 1;
			} else {
				likes -= 1;
			}
		});
	};

	const handleFavorite = () => {
		toggleFavorite({ postId }).then((result: boolean) => {
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
				<div className="mt-2">
					<form>
						<textarea
							id="comment"
							name="comment"
							className="block w-full rounded-md border p-2 text-sm"
							placeholder="Laisser un commentaire"
						/>
					</form>
				</div>
			)}
		</div>
	);
}
