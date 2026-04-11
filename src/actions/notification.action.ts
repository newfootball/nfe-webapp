"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";

export async function markNotificationRead(notifId: string) {
	const currentUserId = await getUserSessionId();
	if (!currentUserId) return { success: false };

	const notification = await prisma.notification.findUnique({
		where: { id: notifId },
		select: { userId: true },
	});

	if (!notification || notification.userId !== currentUserId) {
		return { success: false };
	}

	await prisma.notification.update({
		where: { id: notifId },
		data: { readAt: new Date() },
	});

	return { success: true };
}

export async function markAllNotificationsRead() {
	const currentUserId = await getUserSessionId();
	if (!currentUserId) return { success: false };

	await prisma.notification.updateMany({
		where: { userId: currentUserId, readAt: null },
		data: { readAt: new Date() },
	});

	return { success: true };
}
