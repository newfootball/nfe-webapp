import { expect, test } from "bun:test";
import { AppwriteException, type TablesDB } from "node-appwrite";
import { validateStartAccountDeletion } from "../src/lib/account-deletion-contract";
import {
	beginAccountDeletionWith,
	beginAuthorized,
	fenceAccountsWith,
} from "../src/lib/account-lifecycle-anchor.server";
import { AuthFailure } from "../src/lib/auth-context.server";

// A small optimistic-transaction fake represents the external Appwrite boundary.
// It intentionally rejects a stale staged write at commit, like the backend contract.
class Store {
	rows = new Map<string, { value: Record<string, unknown>; version: number }>();
	txs = new Map<
		string,
		Map<string, { value: Record<string, unknown>; base: number }>
	>();
	next = 0;
	key(table: string, id: string) {
		return `${table}/${id}`;
	}
	seed(table: string, id: string, value: Record<string, unknown>) {
		this.rows.set(this.key(table, id), { value, version: 1 });
	}
	async getRow({ tableId, rowId }: { tableId: string; rowId: string }) {
		const row = this.rows.get(this.key(tableId, rowId));
		if (!row) throw new AppwriteException("missing", 404, "row_not_found");
		return { ...row.value, $id: rowId, $updatedAt: String(row.version) };
	}
	async createTransaction() {
		const id = `tx${++this.next}`;
		this.txs.set(id, new Map());
		return { $id: id };
	}
	async updateRow(args: {
		tableId: string;
		rowId: string;
		transactionId: string;
		data: Record<string, unknown>;
	}) {
		this.stage(args);
	}
	async createRow(args: {
		tableId: string;
		rowId: string;
		transactionId: string;
		data: Record<string, unknown>;
	}) {
		this.stage(args);
	}
	stage({
		tableId,
		rowId,
		transactionId,
		data,
	}: {
		tableId: string;
		rowId: string;
		transactionId: string;
		data: Record<string, unknown>;
	}) {
		const key = this.key(tableId, rowId),
			row = this.rows.get(key);
		this.txs.get(transactionId)?.set(key, {
			value: { ...row?.value, ...data },
			base: row?.version ?? 0,
		});
	}
	async updateTransaction({
		transactionId,
		commit,
	}: {
		transactionId: string;
		commit?: boolean;
		rollback?: boolean;
	}) {
		const writes = this.txs.get(transactionId);
		if (!writes) throw new Error("unknown transaction");
		if (commit) {
			for (const [key, row] of writes)
				if ((this.rows.get(key)?.version ?? 0) !== row.base)
					throw new Error("conflict");
			for (const [key, row] of writes)
				this.rows.set(key, { value: row.value, version: row.base + 1 });
		}
		this.txs.delete(transactionId);
	}
	db() {
		return this as unknown as TablesDB;
	}
}
const id = "f8a22f7d-564e-4be3-bf77-6354c8579fb4";

test("begin fences an already staged actor/peer writer and later writers", async () => {
	const store = new Store();
	store.seed("account_lifecycle_anchors", "alice", { state: "ACTIVE" });
	store.seed("account_lifecycle_anchors", "bob", { state: "ACTIVE" });
	const writer = await store.createTransaction();
	await fenceAccountsWith(store.db(), "db", writer.$id, ["alice", "bob"]);
	expect(await beginAccountDeletionWith(store.db(), "db", "bob", id)).toEqual({
		operationId: id,
		phase: "PREPARING",
	});
	await expect(
		store.updateTransaction({ transactionId: writer.$id, commit: true }),
	).rejects.toThrow("conflict");
	const later = await store.createTransaction();
	await expect(
		fenceAccountsWith(store.db(), "db", later.$id, ["alice", "bob"]),
	).rejects.toBeInstanceOf(AuthFailure);
	expect(await beginAccountDeletionWith(store.db(), "db", "bob", id)).toEqual({
		operationId: id,
		phase: "PREPARING",
	});
	await expect(
		beginAccountDeletionWith(store.db(), "db", "alice", id),
	).rejects.toBeInstanceOf(AuthFailure);
});

test("begin rejects origin, identity and forged input before starting a journal", async () => {
	let starts = 0;
	const valid = validateStartAccountDeletion({
		requestId: id,
		confirmation: "DELETE_ALL_SENT_RECEIVED",
	});
	const services = {
		checkOrigin: () => {},
		getIdentity: async () => "alice",
		start: async (ownerId: string, operationId: string) => {
			starts++;
			return { ownerId, operationId, phase: "PREPARING" };
		},
	};
	await expect(
		beginAuthorized(valid, {
			...services,
			checkOrigin: () => {
				throw new AuthFailure("origin");
			},
		}),
	).rejects.toBeInstanceOf(AuthFailure);
	await expect(
		beginAuthorized(valid, {
			...services,
			getIdentity: async () => {
				throw new AuthFailure("unauthorized");
			},
		}),
	).rejects.toBeInstanceOf(AuthFailure);
	const forged = validateStartAccountDeletion({
		requestId: id,
		confirmation: "DELETE_ALL_SENT_RECEIVED",
		ownerId: "bob",
	});
	await expect(beginAuthorized(forged, services)).rejects.toBeInstanceOf(
		AuthFailure,
	);
	expect(starts).toBe(0);
	expect(await beginAuthorized(valid, services)).toMatchObject({
		ownerId: "alice",
		operationId: id,
	});
});

test("concurrent ACTIVE changes and first creation remain retryable, while withdrawal is forbidden", async () => {
	for (const initial of [true, false]) {
		for (const state of ["ACTIVE", "PREPARING"]) {
			const store = new Store();
			if (initial)
				store.seed("account_lifecycle_anchors", "alice", { state: "ACTIVE" });
			const original = store.getRow.bind(store);
			let reads = 0;
			store.getRow = async (args) => {
				if (args.tableId === "account_lifecycle_anchors" && ++reads === 2) {
					store.rows.set(store.key(args.tableId, args.rowId), {
						value: { state },
						version: 2,
					});
				}
				return original(args);
			};
			const tx = await store.createTransaction();
			try {
				await fenceAccountsWith(store.db(), "db", tx.$id, ["alice"]);
				throw new Error("expected conflict");
			} catch (error) {
				if (state === "ACTIVE") expect(error).toMatchObject({ code: 409 });
				else expect(error).toBeInstanceOf(AuthFailure);
			}
		}
	}
});

test("admin deletion fences the comment author before the delete can run", async () => {
	const { deleteCommentAnchored } = await import(
		"../src/lib/interactions.server"
	);
	const store = new Store();
	store.seed("account_lifecycle_anchors", "admin", { state: "ACTIVE" });
	store.seed("account_lifecycle_anchors", "owner", { state: "ACTIVE" });
	store.seed("account_lifecycle_anchors", "author", { state: "PREPARING" });
	let deleted = false;
	const post = { $id: "post", userId: "owner" } as never;
	const comment = { $id: "comment", userId: "author" } as never;
	await expect(
		deleteCommentAnchored(
			post,
			"admin",
			comment,
			async (parent, actor, author) => {
				const tx = await store.createTransaction();
				await fenceAccountsWith(store.db(), "db", tx.$id, [
					actor,
					String(parent.userId),
					author,
				]);
				deleted = true;
			},
		),
	).rejects.toBeInstanceOf(AuthFailure);
	expect(deleted).toBe(false);
});

test("follow conflict is a replay only when the desired edge exists", async () => {
	const { verifyFollowReplay } = await import("../src/lib/follow.server");
	const conflict = new AppwriteException("collision", 409, "conflict");
	await expect(
		verifyFollowReplay(conflict, true, async () => null),
	).rejects.toBe(conflict);
	await expect(
		verifyFollowReplay(conflict, true, async () => ({ $id: "edge" })),
	).resolves.toBeUndefined();
	const missing = new AppwriteException("missing", 404, "row_not_found");
	await expect(
		verifyFollowReplay(missing, false, async () => ({ $id: "edge" })),
	).rejects.toBe(missing);
	await expect(
		verifyFollowReplay(missing, false, async () => null),
	).resolves.toBeUndefined();
});
