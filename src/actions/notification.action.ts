"use server";

import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";

export async function createNotification(
	userId: string,
	content: string,
	link?: string,
) {
	try {
		await prisma.notification.create({
			data: { userId, content, link },
		});
	} catch (error) {
		console.error("Error creating notification:", error);
	}
}

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
