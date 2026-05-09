import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@/src/generated/prisma/client";

export async function createNotification(
	userId: string,
	type: NotificationType,
	content: string,
	link?: string,
) {
	try {
		await prisma.notification.create({
			data: { userId, type, content, link },
		});
	} catch (error) {
		console.error("Error creating notification:", error);
	}
}
