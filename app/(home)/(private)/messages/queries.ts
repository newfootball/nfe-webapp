import { prisma } from "@/lib/prisma";
import { Message, MessageUser } from "./types";
import { formatTimeAgo } from "./utils";

export async function getUsersWithMessages(
	userId: string,
): Promise<MessageUser[]> {
	const messages = await prisma.message.findMany({
		where: {
			OR: [{ fromUserId: userId }, { toUserId: userId }],
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
		orderBy: {
			createdAt: "desc",
		},
		distinct: ["fromUserId", "toUserId"],
	});

	const uniqueUsers = new Map();
	messages.forEach((message) => {
		const otherUser =
			message.fromUserId === userId ? message.toUser : message.fromUser;
		if (!otherUser?.id) return;
		if (!uniqueUsers.has(otherUser.id)) {
			uniqueUsers.set(otherUser.id, {
				id: otherUser.id,
				username: otherUser.name || "Unknown",
				image:
					otherUser.image ||
					`https://api.dicebear.com/9.x/adventurer/svg?seed=${otherUser.id}`,
			});
		}
	});

	return Array.from(uniqueUsers.values());
}

export async function getRecentMessages(userId: string): Promise<Message[]> {
	const messages = await prisma.message.findMany({
		where: {
			OR: [{ fromUserId: userId }, { toUserId: userId }],
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
		orderBy: {
			createdAt: "desc",
		},
		take: 10,
	});

	return messages.map((message) => {
		const otherUser =
			message.fromUserId === userId ? message.toUser : message.fromUser;
		if (!otherUser?.id) {
			throw new Error("Invalid message: missing user information");
		}
		const isFromMe = message.fromUserId === userId;

		return {
			id: message.id,
			user: otherUser.name || "Unknown",
			image:
				otherUser.image ||
				`https://api.dicebear.com/9.x/adventurer/svg?seed=${otherUser.id}`,
			message: isFromMe ? `You: ${message.content}` : message.content,
			time: formatTimeAgo(message.createdAt),
		};
	});
}

export async function getMessagesGroupedByUser(
	currentUserId: string,
): Promise<Record<string, Message[]>> {
	const messages = await prisma.message.findMany({
		where: {
			OR: [{ fromUserId: currentUserId }, { toUserId: currentUserId }],
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
		orderBy: {
			createdAt: "desc",
		},
	});

	const groupedMessages: Record<string, Message[]> = {};

	messages.forEach((message) => {
		const otherUser =
			message.fromUserId === currentUserId ? message.toUser : message.fromUser;
		if (!otherUser?.id) return;

		const isFromMe = message.fromUserId === currentUserId;

		const formattedMessage: Message = {
			id: message.id,
			user: otherUser.name || "Unknown",
			image:
				otherUser.image ||
				`https://api.dicebear.com/9.x/adventurer/svg?seed=${otherUser.id}`,
			message: isFromMe ? `You: ${message.content}` : message.content,
			time: formatTimeAgo(message.createdAt),
		};

		const otherUserId = otherUser.id;
		if (!groupedMessages[otherUserId]) {
			groupedMessages[otherUserId] = [];
		}
		groupedMessages[otherUserId].push(formattedMessage);
	});

	return groupedMessages;
}
