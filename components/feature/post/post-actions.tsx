"use client";

import { Button } from "@/components/ui/button";
import { Bookmark, MessageSquare, Share2, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { toggleLike } from "@/actions/likes.action";

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

	const handleLike = () => {
		toggleLike({ postId }).then((result: boolean) => {
			if (result) {
				likes += 1;
			} else {
				likes -= 1;
			}
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
					<ThumbsUp className="mr-2 h-4 w-4" />
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
				<Button variant="ghost" size="sm" className="flex-1">
					<Bookmark className="mr-2 h-4 w-4" />
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
