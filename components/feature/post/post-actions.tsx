"use client";

import { Bookmark, MessageSquare, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/src/actions/favorite.action";
import { toggleLike } from "@/src/actions/like.action";
import {
	useCommentCount,
	useInvalidateCommentQueries,
} from "@/src/hooks/use-comment-query";
import { useSession } from "@/src/lib/auth-client";
import { hasFavorited } from "@/src/query/favorite.query";
import { hasLiked } from "@/src/query/like.query";
import { usePostsActions } from "@/src/store/posts.store";
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
	comments: initialComments = 0,
	postId,
}: PostActionsProps) {
	const { data: session, isPending } = useSession();
	const userId = session?.user?.id;
	const router = useRouter();

	const [showCommentForm, setShowCommentForm] = useState(false);
	const [isLike, setIsLike] = useState(false);
	const [isFavorite, setIsFavorite] = useState(false);
	const t = useTranslations("posts.post-actions");

	// Use Tanstack Query to fetch and cache comment count
	const { data: commentData } = useCommentCount(postId);
	const { invalidateCommentQueries } = useInvalidateCommentQueries();

	// Use the cached count or fall back to initial count
	const comments =
		commentData?.success && commentData.count !== undefined
			? commentData.count
			: initialComments;

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

	const { likePost, unlikePost } = usePostsActions();

	const redirectToSignIn = () => {
		router.push("/sign-in");
	};

	const handleLike = async () => {
		if (isPending) return;
		if (!userId) {
			redirectToSignIn();
			return;
		}

		try {
			const result = await toggleLike({ postId, userId });
			setIsLike(result);

			if (result) {
				likePost(postId);
			} else {
				unlikePost(postId);
			}
		} catch (error) {
			console.error("Error toggling like:", error);
		}
	};

	const handleFavorite = async () => {
		if (isPending) return;
		if (!userId) {
			redirectToSignIn();
			return;
		}

		try {
			const result = await toggleFavorite({ postId, userId });
			setIsFavorite(result);
		} catch (error) {
			console.error("Error toggling favorite:", error);
		}
	};

	const handleComment = () => {
		if (isPending) return;
		if (!userId) {
			redirectToSignIn();
			return;
		}
		setShowCommentForm(!showCommentForm);
	};

	const updateCommentCount = () => {
		invalidateCommentQueries(postId);
	};

	return (
		<div className="px-2 py-2">
			{(likes > 0 || comments > 0) && (
				<div className="flex items-center justify-between border-b py-2 text-sm text-muted-foreground">
					<div className="flex items-center gap-1">
						<ThumbsUp className="h-4 w-4 fill-current" />
						<span>{likes}</span>
					</div>
					{comments > 0 && (
						<Link href={`/post/${postId}`}>
							{t("comments-count", { count: comments })}
						</Link>
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
					<span className="hidden md:inline">{t("like")}</span>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={handleComment}
				>
					<MessageSquare className="mr-2 h-4 w-4" />
					<span className="hidden md:inline">{t("comment")}</span>
				</Button>
				<PostActionShare postId={postId} />
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={handleFavorite}
				>
					<Bookmark
						className={cn("mr-2 h-4 w-4", { "fill-current": isFavorite })}
					/>
					<span className="hidden md:inline">{t("save")}</span>
				</Button>
			</div>
			{showCommentForm && (
				<>
					<PostFormComment
						postId={postId}
						onCommentPosted={updateCommentCount}
					/>
					<PostCommentsList postId={postId} />
				</>
			)}
		</div>
	);
}
