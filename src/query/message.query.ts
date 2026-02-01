import type { Message, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MessageWithUser = Message & {
	fromUser: Pick<User, "id" | "name" | "image">;
	toUser: Pick<User, "id" | "name" | "image">;
};

type ConversationMessage = Omit<MessageWithUser, "fromUser" | "toUser"> & {
	user: Pick<User, "id" | "name" | "image">;
	isFromCurrentUser: boolean;
};

export async function getConversations(
	userId: string,
): Promise<ConversationMessage[]> {
	const sentMessages = await prisma.message.findMany({
		where: {
			fromUserId: userId,
		},
		orderBy: {
			createdAt: "desc",
		},
		include: {
			toUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
		distinct: ["toUserId"],
	});

	const receivedMessages = await prisma.message.findMany({
		where: {
			toUserId: userId,
		},
		orderBy: {
			createdAt: "desc",
		},
		include: {
			fromUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
		distinct: ["fromUserId"],
	});

	// Create a map of user IDs to their latest message
	const userMap = new Map<string, ConversationMessage>();

	// Add sent messages to the map
	for (const message of sentMessages) {
		const otherUserId = message.toUserId;
		const existingMessage = userMap.get(otherUserId);
		if (
			!existingMessage ||
			new Date(message.createdAt) > new Date(existingMessage.createdAt)
		) {
			userMap.set(otherUserId, {
				...message,
				user: message.toUser,
				isFromCurrentUser: true,
			});
		}
	}

	// Add received messages to the map
	for (const message of receivedMessages) {
		const otherUserId = message.fromUserId;
		const existingMessage = userMap.get(otherUserId);
		if (
			!existingMessage ||
			new Date(message.createdAt) > new Date(existingMessage.createdAt)
		) {
			userMap.set(otherUserId, {
				...message,
				user: message.fromUser,
				isFromCurrentUser: false,
			});
		}
	}

	// Convert the map to an array and sort by createdAt
	const conversations = Array.from(userMap.values()).sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return conversations;
}

export async function getMessages(currentUserId: string, otherUserId: string) {
	const messages = await prisma.message.findMany({
		where: {
			OR: [
				{
					fromUserId: currentUserId,
					toUserId: otherUserId,
				},
				{
					fromUserId: otherUserId,
					toUserId: currentUserId,
				},
			],
		},
		orderBy: {
			createdAt: "asc",
		},
		include: {
			fromUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
			toUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});

	// Mark messages as read
	await prisma.message.updateMany({
		where: {
			fromUserId: otherUserId,
			toUserId: currentUserId,
			readAt: null,
		},
		data: {
			readAt: new Date(),
		},
	});

	return messages;
}

export async function sendMessage(
	fromUserId: string,
	toUserId: string,
	content: string,
) {
	const message = await prisma.message.create({
		data: {
			fromUserId,
			toUserId,
			content,
		},
		include: {
			fromUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
			toUser: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});

	return message;
}

export async function getUnreadMessagesCount(userId: string) {
	const count = await prisma.message.count({
		where: {
			toUserId: userId,
			readAt: null,
		},
	});

	return count;
}

export async function getRecentContacts(userId: string) {
	const recentUsers = await prisma.user.findMany({
		where: {
			OR: [
				{
					messages: {
						some: {
							toUserId: userId,
						},
					},
				},
				{
					messagesTo: {
						some: {
							fromUserId: userId,
						},
					},
				},
			],
		},
		select: {
			id: true,
			name: true,
			image: true,
		},
		take: 10,
	});

	return recentUsers;
}
