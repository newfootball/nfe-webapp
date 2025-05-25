"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLastComments } from "@/src/hooks/use-comment-query";

interface PostCommentsListProps {
	postId: string;
}

export const PostCommentsList = ({ postId }: PostCommentsListProps) => {
	// Use Tanstack Query to fetch and cache comments
	const {
		data: commentsResult,
		isLoading,
		error: queryError,
	} = useLastComments(postId);

	// Extract comments from the query result
	const comments = commentsResult?.success ? (commentsResult.data ?? []) : [];
	// Extract error message from the query result
	const error = queryError
		? "Une erreur s'est produite lors de la récupération des commentaires"
		: commentsResult?.success
			? null
			: (commentsResult?.error ?? null);

	if (isLoading) {
		return (
			<div className="mt-4 text-sm text-muted-foreground">
				Chargement des commentaires...
			</div>
		);
	}

	if (error) {
		return <div className="mt-4 text-sm text-red-500">{error}</div>;
	}

	if (comments.length === 0) {
		return (
			<div className="mt-4 text-sm text-muted-foreground text-center py-4">
				Aucun commentaire
			</div>
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
								{comment.user.name || "Utilisateur"}
							</span>
							<span className="text-xs text-muted-foreground">
								{new Date(comment.createdAt).toLocaleDateString()}
							</span>
						</div>
						<p className="mt-1 text-sm">{comment.content}</p>
					</div>
				</div>
			))}
		</div>
	);
};
