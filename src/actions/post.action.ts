"use server";

import { prisma } from "@/lib/prisma";
import { SignalReason, SignalStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getUserSessionId } from "../query/user.query";

export async function deletePost(postId: string) {
	try {
		const userId = await getUserSessionId();
		if (!userId) {
			throw new Error("Unauthorized");
		}

		// Verify the post belongs to the user
		const post = await prisma.post.findUnique({
			where: { id: postId },
			select: { userId: true },
		});

		if (!post || post.userId !== userId) {
			throw new Error("Unauthorized to delete this post");
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
		return { error: "Failed to delete post" };
	}
}

export async function signalPost(
	postId: string,
	reason: SignalReason,
	details?: string,
) {
	try {
		const userId = await getUserSessionId();
		if (!userId) {
			return { error: "Vous devez être connecté pour signaler un post" };
		}

		// Verify that both the user and post exist
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true },
		});

		if (!user) {
			return { error: "Utilisateur non trouvé" };
		}

		const post = await prisma.post.findUnique({
			where: { id: postId },
			select: { id: true },
		});

		if (!post) {
			return { error: "Post non trouvé" };
		}

		// Check if the user has already signaled this post
		const existingSignal = await prisma.postSignal.findFirst({
			where: {
				postId,
				userId,
			},
		});

		if (existingSignal) {
			return { error: "Vous avez déjà signalé ce post" };
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

		return { success: true, message: "Post signalé avec succès" };
	} catch (error) {
		console.error("Error signaling post:", error);
		return { error: "Échec du signalement du post" };
	}
}
