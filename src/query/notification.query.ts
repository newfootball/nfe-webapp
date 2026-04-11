"use server";

import { prisma } from "@/lib/prisma";

export const getNotifications = async (userId: string) => {
	return prisma.notification.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: 20,
	});
};

export const getUnreadNotificationCount = async (
	userId: string,
): Promise<number> => {
	return prisma.notification.count({
		where: { userId, readAt: null },
	});
};
