"use server";

import { type SignalReason, SignalStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "../query/user.query";

export async function deletePost(postId: string) {
	const t = await getTranslations("actions.post");

	try {
		const userId = await getUserSessionId();
		if (!userId) {
			throw new Error(t("unauthorized"));
		}

		// Verify the post belongs to the user
		const post = await prisma.post.findUnique({
			where: { id: postId },
			select: { userId: true },
		});

		if (!post || post.userId !== userId) {
			throw new Error(t("unauthorized-to-delete-post"));
		}

		// Delete the post and all related data (comments, likes, favorites)
		await prisma.post.delete({
			where: { id: postId },
		});

		revalidatePath("/post/my");
		revalidatePath("/");

		return { success: true };
	} catch (error) {
		console.error("Error deleting post:", error);
		return { error: t("failed-to-delete-post") };
	}
}

export async function signalPost(
	postId: string,
	reason: SignalReason,
	details?: string,
) {
	const t = await getTranslations("actions.post");

	try {
		const userId = await getUserSessionId();
		if (!userId) {
			return { error: t("must-be-logged-in-to-report") };
		}

		// Verify that both the user and post exist
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true },
		});

		if (!user) {
			return { error: t("user-not-found") };
		}

		const post = await prisma.post.findUnique({
			where: { id: postId },
			select: { id: true },
		});

		if (!post) {
			return { error: t("post-not-found") };
		}

		// Check if the user has already signaled this post
		const existingSignal = await prisma.postSignal.findFirst({
			where: {
				postId,
				userId,
			},
		});

		if (existingSignal) {
			return { error: t("already-reported-this-post") };
		}

		// Create the signal
		await prisma.postSignal.create({
			data: {
				postId,
				userId,
				reason,
				details,
				status: SignalStatus.PENDING,
			},
		});

		// Update the post's spam score if there are multiple signals
		const signalCount = await prisma.postSignal.count({
			where: { postId },
		});

		if (signalCount >= 5) {
			await prisma.post.update({
				where: { id: postId },
				data: { spamScore: "SUSPECT" },
			});
		}

		if (signalCount >= 10) {
			await prisma.post.update({
				where: { id: postId },
				data: { spamScore: "SPAM" },
			});
		}

		return { success: true, message: t("post-reported-successfully") };
	} catch (error) {
		console.error("Error signaling post:", error);
		return { error: t("failed-to-report-post") };
	}
}
