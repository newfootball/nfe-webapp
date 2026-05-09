"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/src/lib/auth-server";

export const getCountFollowers = async (userId: string): Promise<number> => {
	if (!userId) return 0;

	const countFollowers = await prisma.follow.count({
		where: {
			followingId: userId,
		},
	});
	return countFollowers;
};

export const getCountFollowing = async (userId: string): Promise<number> => {
	if (!userId) return 0;

	const countFollowing = await prisma.follow.count({
		where: {
			followerId: userId,
		},
	});
	return countFollowing;
};

export async function getFollowers(userId: string) {
	const follows = await prisma.follow.findMany({
		where: { followingId: userId },
		include: {
			follower: {
				select: { id: true, name: true, image: true, userType: true },
			},
		},
		orderBy: { createdAt: "desc" },
	});
	return follows.map((f) => f.follower);
}

export async function getFollowing(userId: string) {
	const follows = await prisma.follow.findMany({
		where: { followerId: userId },
		include: {
			followed: {
				select: { id: true, name: true, image: true, userType: true },
			},
		},
		orderBy: { createdAt: "desc" },
	});
	return follows.map((f) => f.followed);
}

export async function checkIsFollowing(
	userToFollowId: string,
): Promise<boolean> {
	try {
		const session = await getSession();

		if (!session?.user?.id) {
			console.warn("No session found");
			return false;
		}

		const currentUserId = session.user.id;

		const follow = await prisma.follow.count({
			where: {
				followerId: currentUserId,
				followingId: userToFollowId,
			},
		});

		return !!follow;
	} catch (error) {
		console.error("Erreur lors de la vérification du statut de suivi:", error);
		return false;
	}
}
