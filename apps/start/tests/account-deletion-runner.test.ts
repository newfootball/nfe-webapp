import { afterEach, expect, spyOn, test } from "bun:test";
import { AppwriteException, TablesDB } from "node-appwrite";
import {
	consumeAccountDeletions,
	resumeAccountDeletionOperation,
} from "../src/lib/account-deletion.server";

const saved = { ...process.env };
afterEach(() => {
	process.env = { ...saved };
});
const operationId = "f8a22f7d-564e-4be3-bf77-6354c8579fb4";

test("ambiguous finalizing upload stays blocked without requiring its deleted login", async () => {
	Object.assign(process.env, {
		START_APP_ORIGIN: "http://127.0.0.1:3588",
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		START_APPWRITE_ENDPOINT: "http://127.0.0.1:18158/v1",
		START_APPWRITE_PROJECT: "synthetic",
		START_APPWRITE_SESSION_KEY: "session",
		START_APPWRITE_DATABASE: "db",
		START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY: "account-key",
	});
	let op: Record<string, unknown> = {
		$id: operationId,
		ownerId: "alice",
		phase: "ASSETS",
		step: 0,
		token: null,
		leaseUntil: null,
	};
	let seq = 0;
	const txs = new Map<string, Record<string, unknown>>();
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockImplementation(async () => {
		const tx = `tx${++seq}`;
		txs.set(tx, {});
		return { $id: tx } as never;
	});
	const get = spyOn(TablesDB.prototype, "getRow").mockImplementation(
		async (args) => {
			if (typeof args !== "string" && args.tableId === "media_assets")
				throw new AppwriteException("missing", 404, "row_not_found");
			return { ...op } as never;
		},
	);
	const update = spyOn(TablesDB.prototype, "updateRow").mockImplementation(
		async (args) => {
			if (typeof args === "string") throw new Error("unexpected");
			const data = args.data as Record<string, unknown>;
			Object.assign(txs.get(String(args.transactionId)) ?? {}, data);
			return { ...op, ...data } as never;
		},
	);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockImplementation(
		async (args) => {
			if (typeof args === "string") throw new Error("unexpected");
			if (args.commit) op = { ...op, ...txs.get(args.transactionId) };
			return {} as never;
		},
	);
	const asset = {
		$id: "asset",
		state: "FINALIZING",
		ownerId: "alice",
		leaseUntil: new Date(Date.now() + 60000).toISOString(),
	};
	const list = spyOn(TablesDB.prototype, "listRows").mockResolvedValue({
		rows: [asset],
		total: 1,
	} as never);
	try {
		expect(await resumeAccountDeletionOperation(operationId)).toMatchObject({
			phase: "ASSETS",
			done: false,
		});
		asset.leaseUntil = new Date(0).toISOString();
		expect(await resumeAccountDeletionOperation(operationId)).toEqual({
			operationId,
			phase: "BLOCKED",
			done: false,
		});
		expect(op).toMatchObject({
			phase: "BLOCKED",
			ownerId: "alice",
			token: null,
			leaseUntil: null,
		});
		expect(await resumeAccountDeletionOperation(operationId)).toMatchObject({
			phase: "ASSETS",
			done: false,
		});
		op.inventoryJson = "{}";
		op.currentId = "missing";
		list.mockClear();
		expect(await resumeAccountDeletionOperation(operationId)).toMatchObject({
			phase: "BLOCKED",
			done: false,
		});
		expect(list).not.toHaveBeenCalled();
	} finally {
		for (const spy of [begin, get, update, end, list]) spy.mockRestore();
	}
});

test("operation recovery rejects a forged non-UUID before touching storage", async () => {
	await expect(
		resumeAccountDeletionOperation("../../victim"),
	).rejects.toThrow();
});

test("foreground runner skips a claim acquired concurrently by an administrator", async () => {
	Object.assign(process.env, {
		START_APP_ORIGIN: "http://127.0.0.1:3588",
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		START_APPWRITE_ENDPOINT: "http://127.0.0.1:18158/v1",
		START_APPWRITE_PROJECT: "synthetic",
		START_APPWRITE_SESSION_KEY: "session",
		START_APPWRITE_DATABASE: "db",
		START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY: "account-key",
	});
	const list = spyOn(TablesDB.prototype, "listRows").mockResolvedValue({
		rows: [{ $id: operationId }],
		total: 1,
	} as never);
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockResolvedValue({ $id: "tx" } as never);
	const get = spyOn(TablesDB.prototype, "getRow").mockResolvedValue({
		phase: "ASSETS",
		leaseUntil: new Date(Date.now() + 60000).toISOString(),
	} as never);
	const update = spyOn(TablesDB.prototype, "updateRow").mockResolvedValue(
		{} as never,
	);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockResolvedValue(
		{} as never,
	);
	try {
		expect(await consumeAccountDeletions()).toEqual([]);
		expect(end).toHaveBeenCalledWith({ transactionId: "tx", rollback: true });
	} finally {
		for (const spy of [list, begin, get, update, end]) spy.mockRestore();
	}
});
