import type { Table } from "./schema.mts";

const text = (size = 255, required = true) => ({
	type: "string" as const,
	size,
	required,
});
const integer = { type: "integer" as const, required: true };
const date = (required = true) => ({ type: "datetime" as const, required });
export const lifecycleVersion = "v1-post-lifecycle";
export const lifecycleTables: Record<string, Table> = {
	post_lifecycle_locks: {
		columns: { operationId: text(36), ownerId: text(36) },
		indexes: [],
	},
	post_lifecycle_operations: {
		columns: {
			postId: text(36),
			ownerId: text(36),
			kind: text(16),
			signature: text(2048),
			inventoryJson: text(65535),
			phase: text(32),
			childStep: integer,
			assetStep: integer,
			versionStep: integer,
			token: text(36, false),
			leaseUntil: date(false),
			createdAt: date(),
			updatedAt: date(),
		},
		indexes: [
			{ key: "owner_updated", columns: ["ownerId", "updatedAt"], type: "key" },
		],
	},
};
export const lifecycleDigest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(lifecycleTables))
	.digest("hex");
