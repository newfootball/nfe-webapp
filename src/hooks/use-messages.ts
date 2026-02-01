import type { Message } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
	getConversations,
	getMessages,
	getRecentContacts,
	sendMessage,
} from "@/src/query/message.query";
import { getUserSessionId } from "@/src/query/user.query";

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
	const t = useTranslations("hooks.messages");

	return useQuery<Conversation[]>({
		queryKey: ["conversations"],
		queryFn: async () => {
			const userId = await getUserSessionId();
			if (!userId) {
				throw new Error(t("user-not-authenticated"));
			}
			return getConversations(userId);
		},
	});
}

// Fetch messages between the current user and another user
export function useMessages(otherUserId: string) {
	const t = useTranslations("hooks.messages");

	return useQuery<MessageWithUser[]>({
		queryKey: ["messages", otherUserId],
		queryFn: async () => {
			const currentUserId = await getUserSessionId();
			if (!currentUserId) {
				throw new Error(t("user-not-authenticated"));
			}
			return getMessages(currentUserId, otherUserId);
		},
		enabled: !!otherUserId,
	});
}

// Send a message to another user
export function useSendMessage() {
	const queryClient = useQueryClient();
	const t = useTranslations("hooks.messages");

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
				throw new Error(t("user-not-authenticated"));
			}
			return sendMessage(fromUserId, toUserId, content);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["conversations"] });

			queryClient.invalidateQueries({
				queryKey: ["messages", variables.toUserId],
			});
		},
	});
}

export function useRecentContacts() {
	const t = useTranslations("hooks.messages");

	return useQuery<User[]>({
		queryKey: ["recentContacts"],
		queryFn: async () => {
			const userId = await getUserSessionId();
			if (!userId) {
				throw new Error(t("user-not-authenticated"));
			}
			return getRecentContacts(userId);
		},
	});
}
