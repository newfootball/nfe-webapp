"use server";

import { prisma } from "@/lib/prisma";
import { PostWithUserAndMedias } from "@/src/types/post.types";

export const getCountPosts = async (userId: string): Promise<number> => {
	if (!userId) return 0;
	const countPosts = await prisma.post.count({
		where: {
			userId,
		},
	});

	return countPosts;
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
	const where: { userId?: string } = {};

	if (userId) {
		where.userId = userId;
	}

	const posts = await prisma.post.findMany({
		where,
		take: limit,
		skip: offset,
		include: {
			user: true,
			medias: true,
			_count: {
				select: {
					comments: true,
					likes: true,
				},
			},
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
			_count: {
				select: {
					comments: true,
					likes: true,
				},
			},
		},
	});

	return post;
};
