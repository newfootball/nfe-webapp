import { mediaV3Tables } from "../appwrite-schema/media-v3-contract.mts";
import { messagingDefinition } from "../appwrite-schema/messaging.mts";
import { notificationV1Tables } from "../appwrite-schema/notification-v1-contract.mts";
import { profileV2Definition } from "../appwrite-schema/profile-v2-contract.mts";
import { tables as base, type Column } from "../appwrite-schema/schema.mts";
import type { ProjectionRow } from "./projection";

const contract: Record<string, Record<string, Column>> = Object.fromEntries(
	Object.entries(base)
		.filter(([name]) => name !== "schema_versions")
		.map(([name, table]) => [name, { ...table.columns }]),
);
contract.private_profiles = {
	...contract.private_profiles,
	...profileV2Definition.private_profiles,
} as Record<string, Column>;
for (const [name, table] of Object.entries(mediaV3Tables))
	contract[name] = table.columns;
contract.notifications_v1 = notificationV1Tables.notifications_v1!.columns;
contract.message_conversations = Object.fromEntries(
	Object.entries(messagingDefinition.message_conversations.columns).map(
		([name, column]) => [name, { ...column, required: true }],
	),
);
export const BUSINESS_TABLES = Object.keys(contract).sort();
export function normalizeRow(row: ProjectionRow): ProjectionRow {
	const columns = contract[row.table];
	if (
		!columns ||
		!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(row.id) ||
		!Array.isArray(row.permissions) ||
		row.permissions.some((p) => typeof p !== "string") ||
		new Set(row.permissions).size !== row.permissions.length ||
		Object.keys(row.data).some((k) => !columns[k])
	)
		throw new Error("invalid_contract_row");
	const data: Record<string, unknown> = {};
	for (const [key, column] of Object.entries(columns)) {
		let value = row.data[key];
		if (value === undefined || value === null) {
			if (column.required) throw new Error("invalid_contract_row");
			data[key] = null;
			continue;
		}
		const check = (v: unknown) => {
			if (column.type === "string" || column.type === "enum")
				return (
					typeof v === "string" &&
					(column.size === undefined || [...v].length <= column.size) &&
					(column.type !== "enum" || column.elements?.includes(v))
				);
			if (column.type === "integer")
				return typeof v === "number" && Number.isSafeInteger(v);
			if (column.type === "boolean") return typeof v === "boolean";
			return (
				typeof v === "string" &&
				/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
					v,
				) &&
				Number.isFinite(Date.parse(v))
			);
		};
		if (
			column.array
				? !Array.isArray(value) || !value.every(check)
				: !check(value)
		)
			throw new Error("invalid_contract_row");
		if (column.type === "datetime" && typeof value === "string")
			value = new Date(value).toISOString();
		data[key] = value;
	}
	return {
		table: row.table,
		id: row.id,
		data,
		permissions: [...row.permissions].sort(),
	};
}
