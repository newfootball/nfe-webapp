import { prisma } from "@/lib/prisma";

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
