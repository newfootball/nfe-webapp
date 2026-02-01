"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";
export const addFollow = async ({
	userToFollowId,
	userId = null,
}: {
	userToFollowId: string;
	userId?: string | null;
}) => {
	const t = await getTranslations("follow-button");
	if (!userId) {
		userId = await getUserSessionId();
	}

	if (!userId) {
		throw new Error(t("user-not-found"));
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
		throw new Error(t("failed-to-follow-user"));
	}
};
