"use server";

import { prisma } from "@/src/lib/prisma";
import type { PostWithMedias } from "@/src/types/post.types";

const MAX_POSTS = 3;

export const lastPostsLikedQuery = async ({
	userId,
	limit = MAX_POSTS,
}: {
	userId: string;
	limit?: number;
}): Promise<PostWithMedias[]> => {
	return prisma.post.findMany({
		where: {
			likes: {
				some: {
					userId: userId,
				},
			},
		},
		take: limit,
		include: {
			medias: true,
		},
	});
};

export const lastPostsLikedQueryCount = async (
	userId: string,
): Promise<number> => {
	return prisma.post.count({
		where: {
			likes: {
				some: {
					userId: userId,
				},
			},
		},
	});
};
