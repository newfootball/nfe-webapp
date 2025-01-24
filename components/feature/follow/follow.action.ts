import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/src/query/user.query";

export const addFollow = async ({
	userToFollowId,
	userId = null,
}: {
	userToFollowId: string;
	userId?: string | null;
}) => {
	if (!userId) {
		const user = await getUserSession();

		if (!user) throw new Error("User not found");

		userId = user?.id;
	}

	const follow = await prisma.follow.create({
		data: {
			followerId: userId,
			followingId: userToFollowId,
		},
	});

	return follow;
};
