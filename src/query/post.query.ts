"use server";

import { prisma } from "@/lib/prisma";
import type { PostsPage, PostWithUserAndMedias } from "@/src/types/post.types";

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

export const getPostsWithCursor = async ({
	userId,
	cursor,
	limit = 10,
}: {
	userId?: string;
	cursor?: string | null;
	limit?: number;
}): Promise<PostsPage> => {
	const where: { userId?: string; status: "PUBLISHED" } = {
		status: "PUBLISHED",
	};

	if (userId) {
		where.userId = userId;
	}

	const posts = await prisma.post.findMany({
		where,
		take: limit + 1,
		...(cursor && { skip: 1, cursor: { id: cursor } }),
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

	const hasMore = posts.length > limit;
	const slicedPosts = hasMore ? posts.slice(0, limit) : posts;
	const nextCursor = hasMore
		? (slicedPosts[slicedPosts.length - 1]?.id ?? null)
		: null;

	return { posts: slicedPosts, nextCursor };
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

export async function getPopularPostsForSitemap() {
	try {
		const posts = await prisma.post.findMany({
			where: {
				status: "PUBLISHED",
				// Seulement les posts avec engagement
				OR: [
					{
						likes: {
							some: {},
						},
					},
					{
						comments: {
							some: {},
						},
					},
				],
			},
			select: {
				id: true,
				updatedAt: true,
				_count: {
					select: {
						likes: true,
						comments: true,
					},
				},
			},
			orderBy: [
				{
					likes: {
						_count: "desc",
					},
				},
				{
					comments: {
						_count: "desc",
					},
				},
			],
			take: 1000, // Limiter pour performance
		});

		return posts;
	} catch (error) {
		console.error("Error fetching popular posts for sitemap:", error);
		return [];
	}
}
