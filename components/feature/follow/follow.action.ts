"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";
import { revalidatePath } from "next/cache";
export const addFollow = async ({
	userToFollowId,
	userId = null,
}: {
	userToFollowId: string;
	userId?: string | null;
}) => {
	if (!userId) {
		userId = await getUserSessionId();
	}

	if (!userId) {
		throw new Error("User not found");
	}

	try {
		const follow = await prisma.follow.create({
			data: {
				followerId: userId,
				followingId: userToFollowId,
			},
		});

		revalidatePath(`/user/${userToFollowId}`);

		return follow;
	} catch (error) {
		console.error(error);
		throw new Error("Failed to follow user");
	}
};
