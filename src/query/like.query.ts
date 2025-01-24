"use server";

import { prisma } from "@/lib/prisma";
import { getUserSession } from "./user.query";

export const hasLiked = async ({
	userId,
	postId,
}: {
	userId?: string | null;
	postId: string;
}) => {
	if (!userId) {
		const user = await getUserSession();
		if (!user?.id) throw new Error("User not found");

		userId = user.id;
	}

	const hasLiked = await prisma.like.count({
		where: {
			userId,
			postId,
		},
	});
	return hasLiked > 0;
};
