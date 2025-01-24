"use server";

import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/src/query/user.query";

export const toggleLike = async ({
	postId,
	userId,
}: {
	postId: string;
	userId?: string | null;
}) => {
	if (!userId) {
		const user = await getUserSession();
		if (!user?.id) throw new Error("User not found");

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

	return true;
};
