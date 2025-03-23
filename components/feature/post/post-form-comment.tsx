"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { saveComment } from "@/src/actions/comment.action";
import { CommentSchema } from "@/src/schemas/comment.schema";
import { Loader2, Send } from "lucide-react";
import { useSession } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { ZodError } from "zod";

interface PostFormCommentProps {
	postId: string;
}

export const PostFormComment = ({ postId }: PostFormCommentProps) => {
	const { data: session } = useSession();
	const userId = session?.user?.id;

	const [comment, setComment] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSaveComment = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!userId) {
			setError("Vous devez être connecté pour commenter");
			return;
		}

		try {
			// Validate the form data
			CommentSchema.parse({
				postId,
				userId,
				content: comment,
			});

			setIsSubmitting(true);
			const result = await saveComment({
				postId,
				userId,
				content: comment.trim(),
			});

			if (!result.success) {
				const defaultErrorMessage =
					"Une erreur non spécifiée s'est produite lors de l'enregistrement du commentaire";
				const errorMessage = Array.isArray(result.error)
					? (result.error[0]?.message ?? defaultErrorMessage)
					: defaultErrorMessage;
				setError(errorMessage);
				return;
			}

			setComment("");
		} catch (error) {
			if (error instanceof ZodError) {
				setError(
					error.errors[0]?.message ??
						"Une erreur non spécifiée s'est produite lors de l'enregistrement du commentaire",
				);
			} else {
				setError(
					"Une erreur s'est produite lors de l'enregistrement du commentaire",
				);
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="mt-2">
			{!userId ? (
				<p className="text-sm text-center text-muted-foreground">
					Connectez-vous pour commenter
				</p>
			) : (
				<form onSubmit={handleSaveComment}>
					<div className="flex items-start space-x-3 pt-4 border-t">
						<Avatar className="w-8 h-8 mt-1">
							<AvatarImage
								src={session?.user?.image || undefined}
								alt="Votre Avatar"
							/>
							<AvatarFallback>
								{session?.user?.name?.charAt(0).toUpperCase() || "?"}
							</AvatarFallback>
						</Avatar>
						<div className="flex-grow">
							<textarea
								id="comment"
								name="comment"
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								placeholder="Partagez votre opinion..."
								className="w-full bg-transparent text-sm focus:outline-none min-h-[40px] resize-y"
								disabled={isSubmitting}
								rows={1}
								style={{ minHeight: "2.5rem", height: "auto" }}
							/>
						</div>
						<Button
							variant="default"
							className="text-current-foreground rounded-full"
							type="submit"
							disabled={isSubmitting || !comment.trim()}
							size="icon"
						>
							{isSubmitting ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Send className="h-4 w-4" />
							)}
						</Button>
					</div>
					{error && <p className="mt-1 text-sm text-red-500">{error}</p>}
				</form>
			)}
		</div>
	);
};
