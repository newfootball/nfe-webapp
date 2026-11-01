import type { Table } from "./schema.mts";

const text = (size: number, required = true) => ({
	type: "string" as const,
	size,
	required,
});
const date = (required = true) => ({ type: "datetime" as const, required });
const integer = { type: "integer" as const, required: true };

// The account row is the shared transaction anchor. A DONE tombstone must not
// be recycled: retries and privileged recovery cannot depend on an Auth session.
export const accountLifecycleVersion = "account-lifecycle-v1";
export const accountLifecycleTables: Record<string, Table> = {
	account_lifecycle_anchors: {
		columns: {
			state: text(16),
			operationId: text(36, false),
			updatedAt: date(),
		},
		indexes: [],
	},
	account_lifecycle_operations: {
		columns: {
			ownerId: text(36, false),
			phase: text(32),
			step: integer,
			inventoryJson: text(65535, false),
			currentId: text(36, false),
			blockedPhase: text(32, false),
			token: text(36, false),
			leaseUntil: date(false),
			createdAt: date(),
			updatedAt: date(),
		},
		indexes: [
			{ key: "owner", columns: ["ownerId"], type: "key" },
			{ key: "phase", columns: ["phase"], type: "key" },
		],
	},
};
// Additive indexes keep previous version digests unchanged.
export const accountLifecycleIndexes: Record<
	string,
	{ key: string; columns: string[]; type: "key" }[]
> = {
	message_limits: [
		{ key: "account_sender", columns: ["senderId"], type: "key" },
	],
	comments: [{ key: "account_author", columns: ["userId"], type: "key" }],
	signals: [{ key: "account_author", columns: ["userId"], type: "key" }],
	notifications_v1: [
		{ key: "account_actor", columns: ["actorId"], type: "key" },
	],
	notification_outbox_v1: [
		{ key: "account_actor", columns: ["actorId"], type: "key" },
		{ key: "account_recipient", columns: ["recipientId"], type: "key" },
	],
	notification_recovery_v1: [
		{ key: "account_outbox", columns: ["outboxId"], type: "key" },
	],
};

export const accountLifecycleDigest = new Bun.CryptoHasher("sha256")
	.update(
		JSON.stringify({
			tables: accountLifecycleTables,
			indexes: accountLifecycleIndexes,
		}),
	)
	.digest("hex");
