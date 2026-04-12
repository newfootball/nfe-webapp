"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "./user.query";

export const getFavoritesByUser = async (userId: string) => {
	const favorites = await prisma.favorite.findMany({
		where: { userId },
		include: {
			post: {
				include: {
					medias: true,
					user: {
						select: { id: true, name: true, image: true },
					},
					_count: {
						select: { likes: true, comments: true },
					},
				},
			},
		},
		orderBy: { createdAt: "desc" },
	});

	return favorites.map((f) => f.post);
};

export const hasFavorited = async ({ postId }: { postId: string }) => {
	const userId = await getUserSessionId();
	if (!userId) return false;

	const count = await prisma.favorite.count({ where: { userId, postId } });
	return count > 0;
};
