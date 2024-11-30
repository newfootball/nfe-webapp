"use server";

import { prisma } from "@/lib/prisma";
import type { Media, Post, User } from "@prisma/client";

export const getCountPosts = async (userId: string): Promise<number> => {
	if (!userId) return 0;
	const countPosts = await prisma.post.count({
		where: {
			userId,
		},
	});

	return countPosts;
};

export type PostWithUserAndMedias = Post & {
	user: User;
	medias: Media[];
};

export const getPosts = async ({
	userId,
	limit = 10,
	offset = 0,
}: {
	userId?: string;
	limit?: number;
	offset?: number;
}): Promise<PostWithUserAndMedias[]> => {
	const where = userId ? { userId } : {};

	const posts = await prisma.post.findMany({
		where,
		take: limit,
		skip: offset,
		include: {
			user: true,
			medias: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	return posts;
};

export const getPost = async (
	id: string,
): Promise<PostWithUserAndMedias | null> => {
	const post = await prisma.post.findUnique({
		where: { id },
		include: {
			user: true,
			medias: true,
		},
	});

	return post;
};
