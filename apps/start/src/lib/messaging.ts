import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import {
	markMessagesRead,
	readConversations,
	readMessages,
	searchMessagePeers,
	sendPrivateMessage,
} from "./messaging.server";
import {
	validateMarkRead,
	validateMessagePage,
	validateMessageSearch,
	validateSendMessage,
} from "./messaging-input";
export const getMessageHistory = createServerFn({ method: "GET" })
	.validator(validateMessagePage)
	.handler(({ data }) => readMessages(data));
export const getConversations = createServerFn({ method: "GET" })
	.validator(validateMessagePage)
	.handler(({ data }) => readConversations(data));
export const findMessagePeers = createServerFn({ method: "GET" })
	.validator(validateMessageSearch)
	.handler(({ data }) => searchMessagePeers(data));
export const sendMessage = createServerFn({ method: "POST" })
	.validator(validateSendMessage)
	.handler(({ data }) => sendPrivateMessage(data));
export const markRead = createServerFn({ method: "POST" })
	.validator(validateMarkRead)
	.handler(({ data }) => markMessagesRead(data));
export const messagingKey = (ownerId: string) =>
	["messaging", ownerId] as const;
export function messageHistoryOptions(ownerId: string, peerId: string) {
	return infiniteQueryOptions({
		queryKey: [...messagingKey(ownerId), "history", peerId],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam, signal }) => {
			const r = await getMessageHistory({
				data: { peerId, cursor: pageParam },
			});
			if (signal.aborted) throw new Error("cancelled");
			if (!r.ok) throw new Error(r.error);
			if (r.value.ownerId !== ownerId) throw new Error("unauthorized");
			return r.value;
		},
		getNextPageParam: (p) => p.nextCursor,
		staleTime: 0,
		retry: false,
	});
}
export function conversationsOptions(ownerId: string) {
	return infiniteQueryOptions({
		queryKey: [...messagingKey(ownerId), "conversations"],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam, signal }) => {
			const r = await getConversations({ data: { cursor: pageParam } });
			if (signal.aborted) throw new Error("cancelled");
			if (!r.ok) throw new Error(r.error);
			if (r.value.ownerId !== ownerId) throw new Error("unauthorized");
			return r.value;
		},
		getNextPageParam: (p) => p.nextCursor,
		staleTime: 0,
		retry: false,
	});
}
export function messagePeersOptions(ownerId: string, q: string) {
	return queryOptions({
		queryKey: [...messagingKey(ownerId), "search", q],
		enabled: q.trim().length >= 2,
		retry: false,
		queryFn: async ({ signal }) => {
			const r = await findMessagePeers({ data: { q } });
			if (signal.aborted) throw new Error("cancelled");
			if (!r.ok) throw new Error(r.error);
			if (r.value.ownerId !== ownerId) throw new Error("unauthorized");
			return r.value;
		},
	});
}
