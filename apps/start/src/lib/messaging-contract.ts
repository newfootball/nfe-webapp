import { z } from "zod";
import { MessagingIdSchema } from "./messaging-input";

const date = z
	.string()
	.refine((v) => Number.isFinite(Date.parse(v)))
	.transform((v) => new Date(v).toISOString());
const MessageRowSchema = z.object({
	$id: MessagingIdSchema,
	fromUserId: MessagingIdSchema,
	toUserId: MessagingIdSchema,
	content: z.string(),
	createdAt: date,
	updatedAt: date,
	readAt: date.nullable(),
});
export function messageDTO(row: unknown, viewerId: string) {
	const { $id, ...message } = MessageRowSchema.parse(row);
	if (message.fromUserId !== viewerId && message.toUserId !== viewerId)
		throw new Error("Not a participant");
	return { id: $id, ...message };
}
export type PrivateMessage = ReturnType<typeof messageDTO>;
export type MessagePeer = {
	id: string;
	name: string | null;
	image: string | null;
};
export type Conversation = {
	id: string;
	peer: MessagePeer;
	latest: PrivateMessage;
	unread: number;
};
export type MessagePage = {
	ownerId: string;
	messages: PrivateMessage[];
	nextCursor: string | null;
};
export type ConversationPage = {
	ownerId: string;
	conversations: Conversation[];
	nextCursor: string | null;
};
// Contract seam only: #58 must persist/deduplicate and localize delivery. No text or locale here.
export type MessageEvent = {
	version: 1;
	type: "MESSAGE";
	eventId: string;
	actorId: string;
	recipientId: string;
	messageId: string;
	occurredAt: string;
};
export function messageEvent(message: PrivateMessage): MessageEvent {
	return {
		version: 1,
		type: "MESSAGE",
		eventId: `message:${message.id}`,
		actorId: message.fromUserId,
		recipientId: message.toUserId,
		messageId: message.id,
		occurredAt: message.createdAt,
	};
}
export type MessagingError =
	| "unauthorized"
	| "forbidden"
	| "origin"
	| "invalid"
	| "unavailable"
	| "conflict"
	| "rateLimited";
export type MessagingResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: MessagingError };
