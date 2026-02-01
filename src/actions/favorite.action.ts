"use server";

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";

export const toggleFavorite = async ({
	postId,
	userId,
}: {
	postId: string;
	userId?: string | null;
}) => {
	const t = await getTranslations("actions.favorite");

	if (!userId) {
		userId = await getUserSessionId();
		if (!userId) throw new Error(t("user-not-found"));
	}

	const favorite = await prisma.favorite.findFirst({
		where: {
			postId,
			userId,
		},
	});

	if (favorite) {
		await prisma.favorite.delete({
			where: {
				id: favorite.id,
			},
		});

		return false;
	}
	await prisma.favorite.create({
		data: {
			postId,
			userId,
		},
	});

	return true;
};
