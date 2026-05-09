"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";

export async function markAllNotificationsRead() {
	const currentUserId = await getUserSessionId();
	if (!currentUserId) return { success: false };

	await prisma.notification.updateMany({
		where: { userId: currentUserId, readAt: null },
		data: { readAt: new Date() },
	});

	revalidatePath("/notifications");
	return { success: true };
}

export async function markNotificationRead(notificationId: string) {
	const currentUserId = await getUserSessionId();
	if (!currentUserId) return { success: false };

	await prisma.notification.updateMany({
		where: { id: notificationId, userId: currentUserId, readAt: null },
		data: { readAt: new Date() },
	});

	revalidatePath("/notifications");
	return { success: true };
}
