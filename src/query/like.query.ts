"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "./user.query";

export const hasLiked = async ({ postId }: { postId: string }) => {
	const userId = await getUserSessionId();
	if (!userId) return false;

	const count = await prisma.like.count({ where: { userId, postId } });
	return count > 0;
};
