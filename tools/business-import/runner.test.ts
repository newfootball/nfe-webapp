import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUSINESS_TABLES } from "./contract";
import type { ProjectionRow } from "./projection";
import { runImport } from "./runner";
import type { Target } from "./target";

class Fake implements Target {
	rows = new Map<string, ProjectionRow>();
	failAfterCreate = false;
	failDelete = false;
	deletes = 0;
	key(table: string, id: string) {
		return `${table}:${id}`;
	}
	async get(table: string, id: string) {
		return this.rows.get(this.key(table, id)) ?? null;
	}
	async create(row: ProjectionRow) {
		this.rows.set(this.key(row.table, row.id), structuredClone(row));
		if (this.failAfterCreate) throw new Error("crash");
	}
	async delete(table: string, id: string) {
		if (this.failDelete) throw new Error("crash");
		this.deletes++;
		this.rows.delete(this.key(table, id));
	}
	async list(table: string) {
		return [...this.rows.values()].filter((row) => row.table === table);
	}
}
const row: ProjectionRow = {
	table: "messages",
	id: "one",
	data: {
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		fromUserId: "a",
		toUserId: "b",
		content: "x",
	},
	permissions: ['read("any")'],
};
async function fixture(
	run: (
		target: Fake,
		options: Parameters<typeof runImport>[0],
	) => Promise<void>,
) {
	const dir = await mkdtemp(join(tmpdir(), "business-runner-"));
	const target = new Fake();
	try {
		await run(target, {
			rows: [row],
			tables: BUSINESS_TABLES,
			snapshot: "snapshot-a",
			endpoint: "http://127.0.0.1:8080/v1",
			project: "nfe-import-63-test",
			database: "db",
			checkpointPath: join(dir, "checkpoint.json"),
			target,
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
test("imports and resumes, then reconciles foreign rows", async () =>
	fixture(async (target, options) => {
		expect((await runImport(options)).created).toBe(1);
		expect((await runImport(options)).resumed).toBe(1);
		target.rows.set("messages:foreign", { ...row, id: "foreign" });
		await expect(runImport(options)).rejects.toThrow("foreign_target_row");
	}));
test("never adopts identical foreign rows", async () =>
	fixture(async (target, options) => {
		await target.create(row);
		await expect(runImport(options)).rejects.toThrow("foreign_target_row");
	}));
test("uncertain creation fails closed", async () =>
	fixture(async (target, options) => {
		target.failAfterCreate = true;
		await expect(runImport(options)).rejects.toThrow("crash");
		target.failAfterCreate = false;
		await expect(runImport(options)).rejects.toThrow(
			"uncertain_create_requires_manual_recovery",
		);
	}));
test("frozen rebuild removes owned deletions and preserves foreign rows", async () =>
	fixture(async (target, options) => {
		await runImport(options);
		target.rows.set("messages:foreign", { ...row, id: "foreign" });
		await expect(runImport({ ...options, rebuild: true })).rejects.toThrow(
			"invalid_import_options",
		);
		await expect(
			runImport({
				...options,
				rows: [],
				snapshot: "snapshot-b",
				rebuild: true,
				frozen: true,
			}),
		).rejects.toThrow("foreign_target_row");
		expect(await target.get("messages", "one")).not.toBeNull();
		expect(await target.get("messages", "foreign")).not.toBeNull();
	}));
const two: ProjectionRow = { ...row, id: "two", data: { ...row.data } };
const changed: ProjectionRow = {
	...row,
	data: { ...row.data, content: "edited" },
};
test("frozen rebuild applies updates and deletions only to owned rows, idempotently", async () =>
	fixture(async (target, options) => {
		await runImport({ ...options, rows: [row, two] });
		await expect(
			runImport({ ...options, rows: [changed], snapshot: "snapshot-b" }),
		).rejects.toThrow("checkpoint_binding_mismatch");
		const rebuilt = await runImport({
			...options,
			rows: [changed],
			snapshot: "snapshot-b",
			rebuild: true,
			frozen: true,
		});
		expect(rebuilt).toMatchObject({
			created: 1,
			resumed: 0,
			deleted: 1,
			replaced: 1,
			rebuild: true,
			ok: true,
		});
		expect((await target.get("messages", "one"))?.data.content).toBe("edited");
		expect(await target.get("messages", "two")).toBeNull();
		const again = await runImport({
			...options,
			rows: [changed],
			snapshot: "snapshot-b",
			rebuild: true,
			frozen: true,
		});
		expect(again).toMatchObject({
			created: 0,
			resumed: 1,
			deleted: 0,
			replaced: 0,
			ok: true,
		});
		expect(target.deletes).toBe(2);
		expect(
			(await runImport({ ...options, rows: [changed], snapshot: "snapshot-b" }))
				.resumed,
		).toBe(1);
	}));
test("frozen rebuild never deletes a row whose content diverged from the importer's write", async () =>
	fixture(async (target, options) => {
		await runImport(options);
		const stored = await target.get("messages", "one");
		if (!stored) throw new Error("missing");
		stored.data.content = "edited on target";
		await expect(
			runImport({
				...options,
				rows: [],
				snapshot: "snapshot-b",
				rebuild: true,
				frozen: true,
			}),
		).rejects.toThrow("owned_row_changed");
		expect(await target.get("messages", "one")).not.toBeNull();
	}));
test("interrupted rebuild deletion resumes only under rebuild and fails closed otherwise", async () =>
	fixture(async (target, options) => {
		await runImport({ ...options, rows: [row, two] });
		target.failDelete = true;
		const next = {
			...options,
			rows: [row],
			snapshot: "snapshot-b",
			rebuild: true,
			frozen: true,
		};
		await expect(runImport(next)).rejects.toThrow("crash");
		target.failDelete = false;
		await expect(runImport(options)).rejects.toThrow("rebuild_in_progress");
		await expect(
			runImport({ ...options, rows: [row], snapshot: "snapshot-b" }),
		).rejects.toThrow("checkpoint_binding_mismatch");
		expect(await runImport(next)).toMatchObject({
			deleted: 1,
			resumed: 1,
			ok: true,
		});
		expect(await target.get("messages", "two")).toBeNull();
		expect(
			(await runImport({ ...options, rows: [row], snapshot: "snapshot-b" })).ok,
		).toBe(true);
	}));

test("normalizes optional nulls and server datetime offsets on resume", async () =>
	fixture(async (target, options) => {
		await runImport(options);
		const stored = await target.get("messages", "one");
		if (!stored) throw new Error("missing");
		stored.data.readAt = null;
		stored.data.createdAt = "2026-01-01T00:00:00+00:00";
		stored.data.updatedAt = "2026-01-01T00:00:00+00:00";
		expect((await runImport(options)).resumed).toBe(1);
	}));
test("foreign rows in another table block every create", async () =>
	fixture(async (target, options) => {
		target.rows.set("post_private:foreign", {
			table: "post_private",
			id: "foreign",
			data: { spamScore: null },
			permissions: [],
		});
		await expect(runImport(options)).rejects.toThrow("foreign_target_row");
		expect(await target.get("messages", "one")).toBeNull();
	}));
