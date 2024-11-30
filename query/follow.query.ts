"use server";

import { prisma } from "@/lib/prisma";

export const getCountFollowers = async (userId: string): Promise<number> => {
	if (!userId) return 0;

	const countFollowers = await prisma.follow.count({
		where: {
			followerId: userId,
		},
	});
	return countFollowers;
};

export const getCountFollowing = async (userId: string): Promise<number> => {
	if (!userId) return 0;

	const countFollowing = await prisma.follow.count({
		where: {
			followingId: userId,
		},
	});
	return countFollowing;
};
