"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "./user.query";

export const hasFavorited = async ({
	userId,
	postId,
}: {
	userId?: string | null;
	postId: string;
}) => {
	if (!userId) {
		userId = await getUserSessionId();
		if (!userId) throw new Error("User not found");
	}

	const hasFavorited = await prisma.favorite.count({
		where: {
			userId,
			postId,
		},
	});

	return hasFavorited > 0;
};
