"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/src/lib/create-notification";
import { getUserSessionId } from "@/src/query/user.query";
import {
	type CommentFormData,
	CommentSchema,
} from "@/src/schemas/comment.schema";

export const saveComment = async (data: CommentFormData) => {
	const t = await getTranslations("actions.comment");

	const userId = await getUserSessionId();
	if (!userId) {
		return {
			success: false,
			error: [{ message: t("unauthorized") }],
		};
	}

	try {
		const validatedData = CommentSchema.parse(data);

		const comment = await prisma.comment.create({
			data: {
				postId: validatedData.postId,
				content: validatedData.content,
				userId,
			},
		});

		const post = await prisma.post.findUnique({
			where: { id: validatedData.postId },
			select: { userId: true },
		});
		if (post && post.userId !== userId) {
			const commenter = await prisma.user.findUnique({
				where: { id: userId },
				select: { name: true },
			});
			await createNotification(
				post.userId,
				`${commenter?.name ?? "Someone"} commented on your post`,
				`/post/${validatedData.postId}`,
			);
		}

		return { success: true, data: comment };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return { success: false, error: error.issues };
		}
		console.error("Error saving comment:", error);

		return {
			success: false,
			error: [
				{
					message: t("error-saving-comment"),
				},
			],
		};
	}
};

export const deleteComment = async (commentId: string) => {
	const t = await getTranslations("actions.comment");

	const userId = await getUserSessionId();
	if (!userId) {
		return { success: false, error: t("unauthorized") };
	}

	try {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: { userId: true, postId: true },
		});

		if (!comment) {
			return { success: false, error: t("delete-comment-error") };
		}

		if (comment.userId !== userId) {
			return { success: false, error: t("unauthorized") };
		}

		await prisma.comment.delete({ where: { id: commentId } });

		return { success: true };
	} catch (error) {
		console.error("Error deleting comment:", error);
		return { success: false, error: t("delete-comment-error") };
	}
};
