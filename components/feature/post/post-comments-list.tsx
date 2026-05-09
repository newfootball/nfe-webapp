"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { deleteComment } from "@/src/actions/comment.action";
import { commentKeys, useLastComments } from "@/src/hooks/use-comment-query";

interface PostCommentsListProps {
	postId: string;
	currentUserId?: string | null;
	onEmptyClick?: () => void;
}

export const PostCommentsList = ({
	postId,
	currentUserId,
	onEmptyClick,
}: PostCommentsListProps) => {
	const t = useTranslations("posts.post-comments-list");
	const queryClient = useQueryClient();
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const {
		data: commentsResult,
		isLoading,
		error: queryError,
	} = useLastComments(postId);

	const comments = commentsResult?.success ? (commentsResult.data ?? []) : [];

	const error = queryError
		? t("error-loading-comments")
		: commentsResult?.success
			? null
			: (commentsResult?.error ?? null);

	const handleDelete = async (commentId: string) => {
		setDeletingId(commentId);
		try {
			const result = await deleteComment(commentId);
			if (result.success) {
				queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
				queryClient.invalidateQueries({ queryKey: commentKeys.count(postId) });
			}
		} finally {
			setDeletingId(null);
		}
	};

	if (isLoading) {
		return (
			<div className="mt-4 text-sm text-muted-foreground">
				{t("loading-comments")}
			</div>
		);
	}

	if (error) {
		return <div className="mt-4 text-sm text-red-500">{error}</div>;
	}

	if (comments.length === 0) {
		return (
			<button
				type="button"
				onClick={onEmptyClick}
				className="w-full mt-4 py-6 flex flex-col items-center gap-1 text-center rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
			>
				<span className="text-sm font-medium text-foreground">
					{t("no-comments")}
				</span>
				<span className="text-xs text-muted-foreground">
					{t("be-first-to-comment")}
				</span>
			</button>
		);
	}

	return (
		<div className="my-4 py-4 space-y-4">
			{comments.map((comment) => (
				<div key={comment.id} className="flex gap-3">
					<Avatar className="h-8 w-8">
						<AvatarImage src={comment.user.image || undefined} />
						<AvatarFallback>
							{comment.user.name?.charAt(0).toUpperCase() || "?"}
						</AvatarFallback>
					</Avatar>
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<span className="font-medium">
								{comment.user.name || t("user")}
							</span>
							<span className="text-xs text-muted-foreground">
								{new Date(comment.createdAt).toLocaleDateString()}
							</span>
							{currentUserId && comment.user.id === currentUserId && (
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
									aria-label={t("delete-comment")}
									disabled={deletingId === comment.id}
									onClick={() => handleDelete(comment.id)}
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							)}
						</div>
						<p className="mt-1 text-sm">{comment.content}</p>
					</div>
				</div>
			))}
		</div>
	);
};
