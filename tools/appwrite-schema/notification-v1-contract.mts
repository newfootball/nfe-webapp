import type { Column, Table } from "./schema.mts";

const s = (size = 255, required = true): Column => ({
	type: "string",
	size,
	required,
});
const date = (required = true): Column => ({ type: "datetime", required });
const base = {
	eventId: s(128),
	type: {
		type: "enum",
		elements: ["LIKE", "COMMENT", "FOLLOW", "MESSAGE"],
		required: true,
	} as Column,
	actorId: s(255, false),
	recipientId: s(),
	targetId: s(255, false),
	entityId: s(),
	occurredAt: date(),
};
export const notificationV1Tables: Record<string, Table> = {
	notifications_v1: {
		columns: {
			...base,
			source: {
				type: "enum",
				elements: ["business", "legacy"],
				required: true,
			},
			readAt: date(false),
		},
		indexes: [
			{
				key: "recipient_time",
				columns: ["recipientId", "occurredAt"],
				type: "key",
			},
			{
				key: "recipient_read",
				columns: ["recipientId", "readAt"],
				type: "key",
			},
			{ key: "event_unique", columns: ["eventId"], type: "unique" },
		],
	},
	notification_outbox_v1: {
		columns: {
			...base,
			source: {
				type: "enum",
				elements: ["business", "legacy"],
				required: true,
			},
			status: {
				type: "enum",
				elements: ["PENDING", "DELIVERED", "FAILED"],
				required: true,
			},
			attempts: { type: "integer", required: true },
			nextAttemptAt: date(),
			claim: s(36, false),
			leaseUntil: date(false),
			deliveredAt: date(false),
		},
		indexes: [
			{ key: "due", columns: ["status", "nextAttemptAt"], type: "key" },
			{ key: "event_unique", columns: ["eventId"], type: "unique" },
		],
	},
	notification_recovery_v1: {
		columns: {
			outboxId: s(36),
			reason: s(255),
			recoveredAt: date(),
			priorAttempts: { type: "integer", required: true },
		},
		indexes: [],
	},
};
export const notificationV1Version = "notification-v1";
export const notificationV1Digest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(notificationV1Tables))
	.digest("hex");
