import {
	getConversations,
	getMessages,
	getRecentContacts,
	sendMessage,
} from "@/src/query/message.query";
import { getUserSessionId } from "@/src/query/user.query";
import { Message } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type MessageWithUser = Message & {
	fromUser: {
		id: string;
		name: string | null;
		image: string | null;
	};
	toUser: {
		id: string;
		name: string | null;
		image: string | null;
	};
};

type Conversation = {
	id: string;
	fromUserId: string;
	toUserId: string;
	content: string;
	readAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	user: {
		id: string;
		name: string | null;
		image: string | null;
	};
	isFromCurrentUser: boolean;
};

type User = {
	id: string;
	name: string | null;
	image: string | null;
};

// Fetch all conversations for the current user
export function useConversations() {
	return useQuery<Conversation[]>({
		queryKey: ["conversations"],
		queryFn: async () => {
			const userId = await getUserSessionId();
			if (!userId) {
				throw new Error("User not authenticated");
			}
			return getConversations(userId);
		},
	});
}

// Fetch messages between the current user and another user
export function useMessages(otherUserId: string) {
	return useQuery<MessageWithUser[]>({
		queryKey: ["messages", otherUserId],
		queryFn: async () => {
			const currentUserId = await getUserSessionId();
			if (!currentUserId) {
				throw new Error("User not authenticated");
			}
			return getMessages(currentUserId, otherUserId);
		},
		enabled: !!otherUserId,
	});
}

// Send a message to another user
export function useSendMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			toUserId,
			content,
		}: {
			toUserId: string;
			content: string;
		}) => {
			const fromUserId = await getUserSessionId();
			if (!fromUserId) {
				throw new Error("User not authenticated");
			}
			return sendMessage(fromUserId, toUserId, content);
		},
		onSuccess: (data, variables) => {
			// Invalidate the conversations query to refetch the latest conversations
			queryClient.invalidateQueries({ queryKey: ["conversations"] });

			// Invalidate the messages query for the specific conversation to refetch the latest messages
			queryClient.invalidateQueries({
				queryKey: ["messages", variables.toUserId],
			});
		},
	});
}

// Fetch recent contacts (users the current user has messaged with)
export function useRecentContacts() {
	return useQuery<User[]>({
		queryKey: ["recentContacts"],
		queryFn: async () => {
			const userId = await getUserSessionId();
			if (!userId) {
				throw new Error("User not authenticated");
			}
			return getRecentContacts(userId);
		},
	});
}
