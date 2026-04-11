"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";

export const getNotifications = async () => {
	const userId = await getUserSessionId();
	if (!userId) return [];

	return prisma.notification.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: 20,
	});
};

export const getUnreadNotificationCount = async (): Promise<number> => {
	const userId = await getUserSessionId();
	if (!userId) return 0;

	return prisma.notification.count({
		where: { userId, readAt: null },
	});
};
