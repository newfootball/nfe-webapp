"use server";

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/src/lib/create-notification";
import { getUserSession } from "@/src/query/user.query";

export const toggleLike = async ({
	postId,
	userId,
}: {
	postId: string;
	userId?: string | null;
}) => {
	const t = await getTranslations("actions.like");

	if (!userId) {
		const user = await getUserSession();
		if (!user?.id) throw new Error(t("user-not-found"));

		userId = user.id;
	}

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
