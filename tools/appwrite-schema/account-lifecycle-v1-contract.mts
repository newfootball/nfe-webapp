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
			ownerId: text(36),
			phase: text(32),
			step: integer,
			token: text(36, false),
			leaseUntil: date(false),
			createdAt: date(),
			updatedAt: date(),
		},
		indexes: [{ key: "owner", columns: ["ownerId"], type: "key" }],
	},
};
export const accountLifecycleDigest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(accountLifecycleTables))
	.digest("hex");
