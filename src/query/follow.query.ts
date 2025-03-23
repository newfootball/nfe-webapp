"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function checkIsFollowing(
	userToFollowId: string,
): Promise<boolean> {
	try {
		const session = await auth();

		if (!session || !session.user?.id) {
			console.log("User not found", session);
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
