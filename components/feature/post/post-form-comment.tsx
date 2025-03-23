"use client";

import { Button } from "@/components/ui/button";
import { saveComment } from "@/src/actions/comment.action";
import { CommentSchema } from "@/src/schemas/comment.schema";
import { type FormEvent, useState } from "react";
import { ZodError } from "zod";

interface PostFormCommentProps {
	postId: string;
	userId: string;
}

export const PostFormComment = ({ postId, userId }: PostFormCommentProps) => {
	const [comment, setComment] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSaveComment = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);

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
			<form onSubmit={handleSaveComment}>
				<textarea
					id="comment"
					name="comment"
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					className="block w-full rounded-md border p-2 text-sm"
					placeholder="Laisser un commentaire"
					disabled={isSubmitting}
				/>
				{error && <p className="mt-1 text-sm text-red-500">{error}</p>}
				<div className="mt-2 flex justify-end">
					<Button
						type="submit"
						size="sm"
						className="w-full sm:w-auto"
						disabled={isSubmitting || !comment.trim()}
					>
						<span>{isSubmitting ? "Enregistrement..." : "Enregistrer"}</span>
					</Button>
				</div>
			</form>
		</div>
	);
};
