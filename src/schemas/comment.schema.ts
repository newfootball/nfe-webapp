import { z } from "zod";

export const CommentSchema = z.object({
	postId: z.string().min(1, "Post ID is required"),
	userId: z.string().min(1, "User ID is required"),
	content: z
		.string()
		.min(1, "Le commentaire ne peut pas être vide")
		.max(1000, "Le commentaire ne peut pas dépasser 1000 caractères"),
});

export type CommentFormData = z.infer<typeof CommentSchema>;
