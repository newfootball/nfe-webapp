"use server";

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/src/lib/create-notification";
import { getUserSessionId } from "@/src/query/user.query";

export const toggleLike = async ({ postId }: { postId: string }) => {
	const t = await getTranslations("actions.like");

	const userId = await getUserSessionId();
	if (!userId) throw new Error(t("user-not-found"));

	const like = await prisma.like.findFirst({
		where: {
			postId,
			userId,
		},
	});

	if (like) {
		await prisma.like.delete({
			where: {
				id: like.id,
			},
		});

		return false;
	}
	await prisma.like.create({
		data: {
			postId,
			userId,
		},
	});

	const post = await prisma.post.findUnique({
		where: { id: postId },
		select: { userId: true },
	});

	if (post && post.userId !== userId) {
		const liker = await prisma.user.findUnique({
			where: { id: userId },
			select: { name: true },
		});
		await createNotification(
			post.userId,
			`${liker?.name ?? "Someone"} liked your post`,
			`/post/${postId}`,
		);
	}

	return true;
};
