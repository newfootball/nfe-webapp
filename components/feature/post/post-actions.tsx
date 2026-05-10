"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Heart, MessageCircle } from "lucide-react";
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
	title?: string;
	onCommentClick?: () => void;
}

export function PostActions({
	likes = 0,
	comments: initialComments = 0,
	postId,
	title,
	onCommentClick,
}: PostActionsProps) {
	const { data: session, isPending } = useSession();
	const userId = session?.user?.id;
	const router = useRouter();

	const [showCommentForm, setShowCommentForm] = useState(false);
	const [isLike, setIsLike] = useState(false);
	const [isFavorite, setIsFavorite] = useState(false);
	const [likeAnimKey, setLikeAnimKey] = useState(0);
	const t = useTranslations("posts.post-actions");

	const { data: commentData } = useCommentCount(postId);
	const { invalidateCommentQueries } = useInvalidateCommentQueries();

	const comments =
		commentData?.success && commentData.count !== undefined
			? commentData.count
			: initialComments;

	useEffect(() => {
		if (!userId) return;

		(async () => {
			const [resultLike, resultFavorite] = await Promise.all([
				hasLiked({ postId }),
				hasFavorited({ postId }),
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

		setLikeAnimKey((k) => k + 1);

		const optimisticLike = !isLike;
		setIsLike(optimisticLike);
		if (optimisticLike) likePost(postId);
		else unlikePost(postId);

		try {
			const result = await toggleLike({ postId });
			if (result !== optimisticLike) {
				setIsLike(result);
				if (result) likePost(postId);
				else unlikePost(postId);
			}
		} catch (error) {
			console.error("Error toggling like:", error);
			setIsLike(!optimisticLike);
			if (!optimisticLike) likePost(postId);
			else unlikePost(postId);
		}
	};

	const handleFavorite = async () => {
		if (isPending) return;
		if (!userId) {
			redirectToSignIn();
			return;
		}

		const optimisticFavorite = !isFavorite;
		setIsFavorite(optimisticFavorite);

		try {
			const result = await toggleFavorite({ postId });
			if (result !== optimisticFavorite) setIsFavorite(result);
		} catch (error) {
			console.error("Error toggling favorite:", error);
			setIsFavorite(!optimisticFavorite);
		}
	};

	const handleComment = () => {
		if (isPending) return;
		if (!userId) {
			redirectToSignIn();
			return;
		}
		if (onCommentClick) {
			onCommentClick();
		} else {
			setShowCommentForm(!showCommentForm);
		}
	};

	const updateCommentCount = () => {
		invalidateCommentQueries(postId);
	};

	return (
		<div className="px-4 pt-2 pb-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center -ml-2">
					<Button
						variant="ghost"
						size="icon"
						className="h-9 w-9"
						onClick={handleLike}
					>
						<motion.div
							key={likeAnimKey}
							initial={likeAnimKey > 0 ? { scale: 1.5 } : false}
							animate={{ scale: 1 }}
							whileTap={{ scale: 0.75 }}
							transition={{ type: "spring", stiffness: 400, damping: 14 }}
						>
							<Heart
								className={cn("h-6 w-6", {
									"fill-red-500 text-red-500": isLike,
								})}
							/>
						</motion.div>
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-9 w-9"
						onClick={handleComment}
					>
						<MessageCircle className="h-6 w-6" />
					</Button>
					<PostActionShare postId={postId} />
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-9 w-9 -mr-2"
					onClick={handleFavorite}
				>
					<Bookmark className={cn("h-6 w-6", { "fill-current": isFavorite })} />
				</Button>
			</div>

			{likes > 0 && (
				<p className="text-sm font-semibold mt-1">
					{t("likes-count", { count: likes })}
				</p>
			)}

			{title && (
				<p className="text-sm mt-1">
					<span className="font-semibold">{title}</span>
				</p>
			)}

			{comments > 0 && (
				<Link
					href={`/post/${postId}`}
					className="text-sm text-muted-foreground mt-1 block"
				>
					{t("comments-count", { count: comments })}
				</Link>
			)}

			<AnimatePresence>
				{showCommentForm && (
					<motion.div
						key="inline-comments"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeInOut" }}
						style={{ overflow: "hidden" }}
						className="mt-2"
					>
						<PostFormComment
							postId={postId}
							onCommentPosted={updateCommentCount}
						/>
						<PostCommentsList postId={postId} />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
