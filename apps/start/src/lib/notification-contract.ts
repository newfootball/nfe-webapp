export const NOTIFICATION_TYPES = [
	"LIKE",
	"COMMENT",
	"FOLLOW",
	"MESSAGE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationEvent = {
	version: 1;
	eventId: string;
	type: NotificationType;
	actorId: string | null;
	recipientId: string;
	targetId: string | null;
	entityId: string;
	occurredAt: string;
};
export type Notification = {
	id: string;
	type: NotificationType;
	actor: { id: string | null; name: string | null };
	target: { id: string | null; available: boolean };
	metadata: { entityId: string; source: "business" | "legacy" };
	createdAt: string;
	readAt: string | null;
};
export type NotificationPage = {
	viewerId: string;
	notifications: Notification[];
	nextCursor: string | null;
	unread: number;
};
// Use the accepted business event, never RPC return text or a caller-supplied recipient.
export function messageNotification(event: MessageEvent): NotificationEvent {
	return {
		version: event.version,
		eventId: event.eventId,
		type: event.type,
		actorId: event.actorId,
		recipientId: event.recipientId,
		targetId: event.actorId,
		entityId: event.messageId,
		occurredAt: event.occurredAt,
	};
}
// Migration trusts the stored enum, never a substring or a username inside localized prose.
// Historical names/text cannot establish identity: actor stays explicitly unknown.
export function legacyNotification(input: {
	id: string;
	userId: string;
	type: NotificationType;
	createdAt: string;
	targetId?: string;
}): NotificationEvent {
	return {
		version: 1,
		eventId: `legacy:${input.id}`,
		type: input.type,
		actorId: null,
		recipientId: input.userId,
		targetId: input.targetId ?? null,
		entityId: input.id,
		occurredAt: input.createdAt,
	};
}

import type { MessageEvent } from "./messaging-contract";
