"use server";

import { prisma } from "@/lib/prisma";
import type { Comment } from "@prisma/client";

export type LastCommentsResult = {
	success: boolean;
	data?: CommentWithUser[];
	error?: string;
};

export type CommentWithUser = Comment & {
	user: {
		name: string | null;
		image: string | null;
	};
};

export type CommentCountResult = {
	success: boolean;
	count?: number;
	error?: string;
};

export const getCommentCount = async (
	postId: string,
): Promise<CommentCountResult> => {
	try {
		const count = await prisma.comment.count({
			where: {
				postId,
			},
		});

		return { success: true, count };
	} catch (error) {
		console.error("Error counting comments:", error);
		return {
			success: false,
			error: "Une erreur s'est produite lors du comptage des commentaires",
		};
	}
};

export const getLastComments = async (
	postId: string,
	limit = 5,
): Promise<LastCommentsResult> => {
	try {
		const comments = await prisma.comment.findMany({
			where: {
				postId,
			},
			include: {
				user: {
					select: {
						name: true,
						image: true,
					},
				},
			},
			orderBy: {
				createdAt: "desc",
			},
			take: limit,
		});

		return { success: true, data: comments };
	} catch (error) {
		console.error("Error fetching comments:", error);
		return {
			success: false,
			error:
				"Une erreur s'est produite lors de la récupération des commentaires",
		};
	}
};
