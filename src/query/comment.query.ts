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
