"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/src/lib/create-notification";
import { getUserSessionId } from "@/src/query/user.query";

export const removeFollow = async ({
	userToUnfollowId,
}: {
	userToUnfollowId: string;
}) => {
	const t = await getTranslations("follow-button");
	const userId = await getUserSessionId();

	if (!userId) {
		return { error: t("user-not-found") };
	}

	try {
		await prisma.follow.deleteMany({
			where: {
				followerId: userId,
				followingId: userToUnfollowId,
			},
		});

		revalidatePath(`/user/${userToUnfollowId}`);

		return { success: true };
	} catch (error) {
		console.error(error);
		return { error: t("failed-to-follow-user") };
	}
};

export const addFollow = async ({
	userToFollowId,
}: {
	userToFollowId: string;
}) => {
	const t = await getTranslations("follow-button");
	const userId = await getUserSessionId();

	if (!userId) {
		return { error: t("user-not-found") };
	}

	if (userId === userToFollowId) {
		return { error: t("user-not-found") };
	}

	try {
		const follow = await prisma.follow.create({
			data: {
				followerId: userId,
				followingId: userToFollowId,
			},
		});

		revalidatePath(`/user/${userToFollowId}`);

		const follower = await prisma.user.findUnique({
			where: { id: userId },
			select: { name: true },
		});
		await createNotification(
			userToFollowId,
			"FOLLOW",
			`${follower?.name ?? "Quelqu'un"} te suit maintenant`,
			`/user/${userId}`,
		);

		return { success: true, follow };
	} catch (error) {
		console.error(error);
		return { error: t("failed-to-follow-user") };
	}
};
