import { randomBytes } from "node:crypto";
import { z } from "zod";
import { atomicPrivate, digest, withLock } from "../identity-import/checkpoint";
import { readPrivate } from "../identity-import/source";
import { BUSINESS_TABLES, normalizeRow } from "./contract";
import type { ProjectionRow } from "./projection";
import { type Target, targetBinding } from "./target";

const entry = z.strictObject({
	table: z.string(),
	id: z.string(),
	hash: z.string(),
	state: z.enum(["intent", "owned", "done"]),
});
const checkpointSchema = z.strictObject({
	version: z.literal(1),
	key: z.string().regex(/^[a-f0-9]{64}$/),
	binding: z.string(),
	snapshot: z.string(),
	tables: z.array(z.string()),
	entries: z.record(z.string(), entry),
});
type Checkpoint = z.infer<typeof checkpointSchema>;
const keyOf = (row: Pick<ProjectionRow, "table" | "id">) =>
	JSON.stringify([row.table, row.id]);
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, canonical(item)]),
		);
	return value;
}
async function load(
	path: string,
	binding: string,
	snapshot: string,
	tables: string[],
): Promise<Checkpoint> {
	try {
		return checkpointSchema.parse(await readPrivate(path));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			return {
				version: 1,
				key: randomBytes(32).toString("hex"),
				binding,
				snapshot,
				tables,
				entries: {},
			};
		throw error;
	}
}
async function verifyOwnedTarget(
	target: Target,
	cp: Checkpoint,
	ref: (value: unknown) => string,
) {
	const seen = new Set<string>();
	for (const table of cp.tables)
		for (const row of await target.list(table)) {
			const key = keyOf(row),
				item = cp.entries[key];
			seen.add(key);
			if (!item || item.table !== table || item.id !== row.id)
				throw new Error("foreign_target_row");
			if (item.state === "intent")
				throw new Error("uncertain_create_requires_manual_recovery");
			if (ref(normalizeRow(row)) !== item.hash)
				throw new Error("owned_row_changed");
		}
	for (const [key, item] of Object.entries(cp.entries))
		if (item.state !== "intent" && !seen.has(key))
			throw new Error("owned_row_missing");
}
export async function assertOwnedTarget(options: {
	target: Target;
	checkpointPath: string;
	endpoint: string;
	project: string;
	database: string;
	snapshot: string;
}) {
	const binding = targetBinding(
		options.endpoint,
		options.project,
		options.database,
	);
	return withLock(options.checkpointPath, async () => {
		const cp = await load(
			options.checkpointPath,
			binding,
			options.snapshot,
			BUSINESS_TABLES,
		);
		if (
			cp.binding !== binding ||
			cp.snapshot !== options.snapshot ||
			JSON.stringify(cp.tables) !== JSON.stringify(BUSINESS_TABLES)
		)
			throw new Error("checkpoint_binding_mismatch");
		await verifyOwnedTarget(options.target, cp, (value) =>
			digest(cp.key, canonical(value)),
		);
	});
}
export async function runImport(options: {
	rows: ProjectionRow[];
	tables: string[];
	snapshot: string;
	endpoint: string;
	project: string;
	database: string;
	checkpointPath: string;
	target: Target;
	batchSize?: number;
	delayMs?: number;
	frozen?: boolean;
	rebuild?: boolean;
}) {
	const { rows, target, checkpointPath } = options;
	const binding = targetBinding(
		options.endpoint,
		options.project,
		options.database,
	);
	const batchSize = options.batchSize ?? 100,
		delayMs = options.delayMs ?? 0;
	if (
		!options.snapshot ||
		!options.tables.length ||
		new Set(options.tables).size !== options.tables.length ||
		JSON.stringify([...options.tables].sort()) !==
			JSON.stringify(BUSINESS_TABLES) ||
		options.tables.some((table) => !/^[a-z][a-z0-9_]*$/.test(table)) ||
		rows.some((row) => !options.tables.includes(row.table)) ||
		!Number.isInteger(batchSize) ||
		batchSize < 1 ||
		batchSize > 1000 ||
		!Number.isInteger(delayMs) ||
		delayMs < 0 ||
		delayMs > 60000 ||
		(options.rebuild && !options.frozen)
	)
		throw new Error("invalid_import_options");
	return withLock(checkpointPath, async () => {
		const tables = [...options.tables].sort();
		const cp = await load(checkpointPath, binding, options.snapshot, tables);
		if (
			cp.binding !== binding ||
			JSON.stringify(cp.tables) !== JSON.stringify(tables) ||
			(!options.rebuild && cp.snapshot !== options.snapshot)
		)
			throw new Error("checkpoint_binding_mismatch");
		const persist = () => atomicPrivate(checkpointPath, cp);
		const ref = (v: unknown) => digest(cp.key, canonical(v));
		const expected = new Map<string, ProjectionRow>();
		for (const row of rows) {
			normalizeRow(row);
			const key = keyOf(row);
			if (expected.has(key)) throw new Error("duplicate_projection_row");
			expected.set(key, row);
		}
		await verifyOwnedTarget(target, cp, ref);
		if (options.rebuild) {
			for (const [key, item] of Object.entries(cp.entries)) {
				if (item.state === "intent")
					throw new Error("uncertain_create_requires_manual_recovery");
				const current = await target.get(item.table, item.id);
				if (current && ref(normalizeRow(current)) !== item.hash)
					throw new Error("owned_row_changed");
				if (current) await target.delete(item.table, item.id);
				delete cp.entries[key];
				await persist();
			}
			cp.snapshot = options.snapshot;
			await persist();
		}
		let created = 0,
			resumed = 0;
		for (const [index, row] of rows.entries()) {
			const key = keyOf(row),
				hash = ref(normalizeRow(row)),
				item = cp.entries[key];
			if (
				item &&
				(item.table !== row.table || item.id !== row.id || item.hash !== hash)
			)
				throw new Error("checkpoint_content_mismatch");
			const current = await target.get(row.table, row.id);
			if (item?.state === "intent" && current)
				throw new Error("uncertain_create_requires_manual_recovery");
			if (!item && current) throw new Error("foreign_row_collision");
			if (item && item.state !== "intent") {
				if (!current || ref(normalizeRow(current)) !== hash)
					throw new Error("owned_row_changed");
				resumed++;
			} else {
				cp.entries[key] = {
					table: row.table,
					id: row.id,
					hash,
					state: "intent",
				};
				await persist();
				await target.create(row);
				cp.entries[key]!.state = "owned";
				await persist();
				created++;
			}
			cp.entries[key]!.state = "done";
			await persist();
			if ((index + 1) % batchSize === 0 && delayMs)
				await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		const report: Record<
			string,
			{
				expected: number;
				actual: number;
				missing: string[];
				foreign: string[];
				changed: string[];
			}
		> = {};
		for (const table of tables) {
			const actual = await target.list(table),
				wanted = rows.filter((row) => row.table === table);
			const seen = new Set<string>();
			const result = {
				expected: wanted.length,
				actual: actual.length,
				missing: [] as string[],
				foreign: [] as string[],
				changed: [] as string[],
			};
			for (const row of actual) {
				const key = keyOf(row),
					projected = expected.get(key);
				seen.add(key);
				if (!projected || !cp.entries[key] || cp.entries[key]?.state !== "done")
					result.foreign.push(ref(key));
				else if (ref(normalizeRow(row)) !== cp.entries[key]?.hash)
					result.changed.push(ref(key));
			}
			for (const row of wanted)
				if (!seen.has(keyOf(row))) result.missing.push(ref(keyOf(row)));
			report[table] = result;
		}
		return {
			created,
			resumed,
			tables: report,
			ok: Object.values(report).every(
				(r) => !r.missing.length && !r.foreign.length && !r.changed.length,
			),
		};
	});
}
