import { afterEach, expect, spyOn, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { AppwriteException, type Models, TablesDB } from "node-appwrite";
import { clearIdentityCache } from "../src/lib/auth-cache";
import { messageDTO, messageEvent } from "../src/lib/messaging-contract";
import {
	legacyNotification,
	messageNotification,
	NOTIFICATION_TYPES,
} from "../src/lib/notification-contract";
import {
	validateNotificationMark,
	validateNotificationPage,
} from "../src/lib/notification-input";
import {
	formatNotificationDate,
	notificationText,
} from "../src/lib/notification-messages";
import {
	deliverClaim,
	notificationId,
	stageLegacyNotification,
	stageNotification,
} from "../src/lib/notification-outbox.server";

const saved = { ...process.env };
afterEach(() => {
	process.env = { ...saved };
});
function environment() {
	Object.assign(process.env, {
		START_APP_ORIGIN: "http://127.0.0.1:3588",
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		START_APPWRITE_ENDPOINT: "http://127.0.0.1:18158/v1",
		START_APPWRITE_PROJECT: "synthetic-notifications",
		START_APPWRITE_SESSION_KEY: "synthetic-session-only",
		START_APPWRITE_DATABASE: "notification-proof",
		START_APPWRITE_NOTIFICATION_WRITER_KEY: "synthetic-writer-only",
		START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY: "synthetic-account-only",
	});
}
test("strict recipient boundary rejects forged roles and actor metadata", () => {
	for (const extra of [
		{ recipientId: "b" },
		{ actorId: "b" },
		{ role: "admin" },
		{ readAt: null },
	]) {
		expect(validateNotificationPage({ viewerId: "a", ...extra }).valid).toBe(
			false,
		);
		expect(
			validateNotificationMark({ viewerId: "a", mode: "all", ...extra }).valid,
		).toBe(false);
	}
	expect(
		validateNotificationMark({ viewerId: "a", mode: "one", id: "notif" }).valid,
	).toBe(true);
	expect(
		validateNotificationMark({ viewerId: "a", mode: "all", id: "notif" }).valid,
	).toBe(false);
});
test("reader locale and enum drive display, arbitrary actor names are never parsed", () => {
	for (const type of NOTIFICATION_TYPES) {
		const item = { type, actor: { id: "a", name: "a aimé te t’a <script>" } };
		expect(notificationText("fr", item)).toContain(item.actor.name);
		expect(notificationText("en", item)).toContain(item.actor.name);
		expect(notificationText("fr", item)).not.toBe(notificationText("en", item));
	}
	expect(
		notificationText("fr", { type: "LIKE", actor: { id: null, name: null } }),
	).toBe("Quelqu’un a aimé votre publication");
	expect(
		notificationText("en", {
			type: "MESSAGE",
			actor: { id: null, name: null },
		}),
	).toBe("Someone sent you a message");
	const migrated = legacyNotification({
		id: "legacy",
		userId: "b",
		type: "FOLLOW",
		createdAt: "2026-10-30T00:00:00.000Z",
	});
	expect(migrated.actorId).toBeNull();
	expect(migrated.targetId).toBeNull();
	expect(migrated.type).toBe("FOLLOW");
});
test("stage uses the business transaction, stable event ID and no client ACL", async () => {
	environment();
	const writes: unknown[] = [];
	const create = spyOn(TablesDB.prototype, "createRow").mockImplementation(
		async (args) => {
			writes.push(args);
			return {} as never;
		},
	);
	try {
		const event = {
			version: 1 as const,
			eventId: "follow:arbitrary-imported-edge",
			type: "FOLLOW" as const,
			actorId: "a",
			recipientId: "b",
			targetId: "a",
			entityId: "arbitrary-imported-edge",
			occurredAt: "2026-10-30T00:00:00.000Z",
		};
		await stageNotification("business-tx", event);
		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({
			transactionId: "business-tx",
			rowId: notificationId(event.eventId),
			permissions: [],
			data: { status: "PENDING", recipientId: "b", type: "FOLLOW" },
		});
		expect(notificationId(event.eventId)).not.toBe(
			notificationId("follow:other"),
		);
		await stageNotification("business-tx", { ...event, recipientId: "a" });
		expect(writes).toHaveLength(1);
		await stageLegacyNotification(
			"business-tx",
			legacyNotification({
				id: "old-follow",
				userId: "b",
				type: "FOLLOW",
				createdAt: event.occurredAt,
			}),
		);
		expect(writes[1]).toMatchObject({
			data: {
				actorId: null,
				targetId: null,
				source: "legacy",
				recipientId: "b",
			},
		});
		await expect(
			stageNotification("business-tx", { ...event, targetId: null }),
		).rejects.toThrow("Business actor and target required");
	} finally {
		create.mockRestore();
	}
});
test("MESSAGE event maps accepted business identity without text and stages in the caller transaction", async () => {
	environment();
	const message = messageDTO(
		{
			$id: "imported.message-7",
			fromUserId: "sender",
			toUserId: "recipient",
			content: "PRIVATE message text must never enter an event",
			createdAt: "2026-10-30T00:00:00.000Z",
			updatedAt: "2026-10-30T00:00:00.000Z",
			readAt: null,
		},
		"sender",
	);
	const event = messageNotification(messageEvent(message));
	expect(event).toEqual({
		version: 1,
		type: "MESSAGE",
		eventId: "message:imported.message-7",
		actorId: "sender",
		recipientId: "recipient",
		targetId: "sender",
		entityId: "imported.message-7",
		occurredAt: "2026-10-30T00:00:00.000Z",
	});
	const create = spyOn(TablesDB.prototype, "createRow").mockResolvedValue(
		{} as never,
	);
	try {
		await stageNotification("message-business-tx", event);
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				transactionId: "message-business-tx",
				rowId: notificationId("message:imported.message-7"),
				data: expect.objectContaining({
					recipientId: "recipient",
					entityId: "imported.message-7",
					type: "MESSAGE",
				}),
			}),
		);
		expect(JSON.stringify(create.mock.calls)).not.toContain(message.content);
	} finally {
		create.mockRestore();
	}
});
test("delivery replay preserves already-read notification and atomically acknowledges outbox", async () => {
	environment();
	const now = new Date().toISOString(),
		row = {
			$id: "notification-id",
			$updatedAt: now,
			eventId: "follow:edge",
			claim: "claim-1",
			leaseUntil: new Date(Date.now() + 60000).toISOString(),
			status: "PENDING",
			recipientId: "b",
		} as unknown as Models.DefaultRow;
	const writes: unknown[] = [];
	const get = spyOn(TablesDB.prototype, "getRow").mockImplementation(
		async (args) =>
			(typeof args !== "string" && args.tableId === "notification_outbox_v1"
				? row
				: typeof args !== "string" &&
						args.tableId === "account_lifecycle_anchors"
					? { $updatedAt: now, state: "ACTIVE" }
					: { ...row, readAt: "2026-10-29T00:00:00.000Z" }) as never,
	);
	const create = spyOn(TablesDB.prototype, "createRow").mockImplementation(
		async () => {
			throw new Error("Replay must not create/reset notification");
		},
	);
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockResolvedValue({ $id: "delivery-tx" } as never);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockResolvedValue(
		{} as never,
	);
	const update = spyOn(TablesDB.prototype, "updateRow").mockImplementation(
		async (args) => {
			writes.push(args);
			return row as never;
		},
	);
	try {
		await deliverClaim(row);
		expect(writes).toHaveLength(3);
		expect(writes[2]).toMatchObject({
			tableId: "notification_outbox_v1",
			transactionId: "delivery-tx",
			data: { status: "DELIVERED" },
		});
		expect(end).toHaveBeenCalledWith({
			transactionId: "delivery-tx",
			commit: true,
		});
	} finally {
		for (const s of [get, create, begin, end, update]) s.mockRestore();
	}
});
test("stale outbox claim cannot acknowledge or deliver", async () => {
	environment();
	const row = {
		$id: "n",
		$updatedAt: "old",
		claim: "old",
		leaseUntil: new Date(Date.now() + 60000).toISOString(),
		status: "PENDING",
	} as unknown as Models.DefaultRow;
	const get = spyOn(TablesDB.prototype, "getRow").mockResolvedValue({
		...row,
		claim: "new",
	} as never);
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockResolvedValue({ $id: "tx" } as never);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockResolvedValue(
		{} as never,
	);
	const update = spyOn(TablesDB.prototype, "updateRow").mockResolvedValue(
		row as never,
	);
	try {
		await expect(deliverClaim(row)).rejects.toMatchObject({ code: 409 });
		expect(end).toHaveBeenCalledWith({ transactionId: "tx", rollback: true });
	} finally {
		for (const s of [get, begin, end, update]) s.mockRestore();
	}
});
test("A→B→A cache switch cancels late A data and replaces mutation ownership", async () => {
	const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		}),
		key = ["notifications", "a"];
	client.setQueryData(key, "old-a");
	const owner = client.getQueryCache().find({ queryKey: key });
	let resolve!: (x: string) => void;
	const pending = client
		.fetchQuery({
			queryKey: key,
			queryFn: () =>
				new Promise<string>((done) => {
					resolve = done;
				}),
		})
		.catch(() => null);
	await clearIdentityCache(client);
	client.setQueryData(["notifications", "b"], "b");
	resolve("late-a");
	await pending;
	expect(client.getQueryData(key)).toBeUndefined();
	await clearIdentityCache(client);
	client.setQueryData(key, "new-a");
	expect(client.getQueryCache().find({ queryKey: key })).not.toBe(owner);
});

test("FR/EN UTC first render matches Bun and Node across host timezones", () => {
	for (const [locale, expected] of [
		["fr", "30/10/2026 10:00 UTC"],
		["en", "2026-10-30 10:00 UTC"],
	] as const) {
		const script = `import {formatNotificationDate} from ${JSON.stringify(new URL("../src/lib/notification-messages.ts", import.meta.url).href)}; process.stdout.write(formatNotificationDate(${JSON.stringify(locale)},"2026-10-30T10:00:00.000Z"));`;
		for (const runtime of ["bun", "node"])
			for (const TZ of ["UTC", "America/New_York", "Africa/Cairo"]) {
				const result = Bun.spawnSync(
					[runtime, "--input-type=module", "-e", script],
					{
						env: { ...process.env, TZ },
					},
				);
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString()).toBe(expected);
			}
	}
	expect(() => formatNotificationDate("fr", "invalid")).toThrow(RangeError);
});

test("delivery cannot recreate a notification for a deleting participant", async () => {
	environment();
	const row = {
		$id: "notification-id",
		$updatedAt: "1",
		eventId: "message:m",
		claim: "claim",
		leaseUntil: new Date(Date.now() + 60000).toISOString(),
		status: "PENDING",
		actorId: "alice",
		recipientId: "bob",
	} as unknown as Models.DefaultRow;
	const get = spyOn(TablesDB.prototype, "getRow").mockImplementation(
		async (args) => {
			if (
				typeof args !== "string" &&
				args.tableId === "account_lifecycle_anchors"
			)
				return {
					state: args.rowId === "bob" ? "PREPARING" : "ACTIVE",
					$updatedAt: "1",
				} as never;
			return row as never;
		},
	);
	const create = spyOn(TablesDB.prototype, "createRow").mockResolvedValue(
		{} as never,
	);
	const update = spyOn(TablesDB.prototype, "updateRow").mockResolvedValue(
		row as never,
	);
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockResolvedValue({ $id: "tx" } as never);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockResolvedValue(
		{} as never,
	);
	try {
		await expect(deliverClaim(row)).rejects.toThrow();
		expect(create).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledWith({ transactionId: "tx", rollback: true });
	} finally {
		for (const s of [get, create, update, begin, end]) s.mockRestore();
	}
});

test("transient account contention retries the whole notification transaction", async () => {
	const { notificationTransaction } = await import(
		"../src/lib/notification-outbox.server"
	);
	let attempts = 0;
	const db = {
		createTransaction: async () => ({ $id: `tx${++attempts}` }),
		updateTransaction: async () => ({}),
	} as unknown as TablesDB;
	const result = await notificationTransaction(db, async (tx) => {
		if (tx === "tx1")
			throw new AppwriteException("contention", 409, "account_anchor_conflict");
		return tx;
	});
	expect(result).toBe("tx2");
	expect(attempts).toBe(2);
});

test("contention release preserves attempts, while failed release and worker crashes are bounded", async () => {
	environment();
	const { consumeNotifications } = await import(
		"../src/lib/notification-outbox.server"
	);
	let outbox: Record<string, unknown> = {
		$id: "n",
		$updatedAt: "1",
		eventId: "message:m",
		type: "MESSAGE",
		actorId: "a",
		recipientId: "b",
		targetId: "a",
		entityId: "m",
		source: "business",
		occurredAt: new Date().toISOString(),
		status: "PENDING",
		attempts: 0,
		nextAttemptAt: new Date(0).toISOString(),
		claim: null,
		leaseUntil: null,
	};
	let notification: Record<string, unknown> | null = null;
	let seq = 0,
		failRelease = true,
		collisions = 0;
	const staged = new Map<
		string,
		Array<{ table: string; data: Record<string, unknown> }>
	>();
	const list = spyOn(TablesDB.prototype, "listRows").mockImplementation(
		async () => ({ rows: [outbox], total: 1 }) as never,
	);
	const get = spyOn(TablesDB.prototype, "getRow").mockImplementation(
		async (args) => {
			if (typeof args === "string") throw new Error("unexpected");
			if (args.tableId === "account_lifecycle_anchors")
				return { state: "ACTIVE", $updatedAt: "1" } as never;
			if (args.tableId === "notification_outbox_v1")
				return { ...outbox } as never;
			if (notification) return notification as never;
			throw new AppwriteException("missing", 404, "row_not_found");
		},
	);
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockImplementation(async () => {
		const id = `t${++seq}`;
		staged.set(id, []);
		return { $id: id } as never;
	});
	const update = spyOn(TablesDB.prototype, "updateRow").mockImplementation(
		async (args) => {
			if (typeof args === "string") throw new Error("unexpected");
			staged.get(String(args.transactionId))?.push({
				table: args.tableId,
				data: args.data as Record<string, unknown>,
			});
			return {} as never;
		},
	);
	const create = spyOn(TablesDB.prototype, "createRow").mockImplementation(
		async (args) => {
			if (typeof args === "string") throw new Error("unexpected");
			staged.get(String(args.transactionId))?.push({
				table: args.tableId,
				data: args.data as Record<string, unknown>,
			});
			return {} as never;
		},
	);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockImplementation(
		async (args) => {
			if (typeof args === "string") throw new Error("unexpected");
			const writes = staged.get(args.transactionId) ?? [];
			if (
				args.commit &&
				failRelease &&
				writes.some(
					(w) =>
						w.table === "notification_outbox_v1" &&
						w.data.claim === null &&
						w.data.status !== "FAILED",
				)
			)
				throw new AppwriteException("release collision", 409, "conflict");
			if (args.commit)
				for (const w of writes) {
					if (w.table === "notification_outbox_v1")
						outbox = { ...outbox, ...w.data, $updatedAt: String(++seq) };
					if (w.table === "notifications_v1") notification = w.data;
				}
			staged.delete(args.transactionId);
			return {} as never;
		},
	);
	try {
		for (let round = 0; round < 7; round++) {
			collisions = 0;
			await consumeNotifications(1, {
				afterFence: async () => {
					collisions++;
					throw new AppwriteException(
						"contention",
						409,
						"account_anchor_conflict",
					);
				},
			});
			expect(collisions).toBe(4);
			expect(outbox).toMatchObject({
				status: "PENDING",
				attempts: round === 0 ? 0 : 1,
			});
			// First release collides; simulate expiry before another worker takes over.
			outbox.leaseUntil = new Date(0).toISOString();
			failRelease = false;
		}
		await consumeNotifications(1);
		expect(outbox).toMatchObject({ status: "DELIVERED", attempts: 1 });
		expect(notification).toMatchObject({
			eventId: "message:m",
			recipientId: "b",
		});
		outbox = {
			...outbox,
			status: "PENDING",
			attempts: 0,
			claim: null,
			leaseUntil: null,
			nextAttemptAt: new Date(0).toISOString(),
		};
		failRelease = true;
		for (let round = 0; round < 6; round++) {
			await consumeNotifications(1, {
				afterClaim: async () => {
					throw new Error("worker interruption");
				},
			});
			outbox.leaseUntil = new Date(0).toISOString();
		}
		expect(outbox).toMatchObject({ status: "FAILED", attempts: 5 });
	} finally {
		for (const spy of [list, get, begin, update, create, end])
			spy.mockRestore();
	}
});

test("permanent 409 is not classified as transient anchor contention", async () => {
	const { notificationTransaction } = await import(
		"../src/lib/notification-outbox.server"
	);
	let calls = 0;
	const db = {
		createTransaction: async () => ({ $id: "tx" }),
		updateTransaction: async () => ({}),
	} as unknown as TablesDB;
	const error = new AppwriteException(
		"unique conflict",
		409,
		"row_already_exists",
	);
	await expect(
		notificationTransaction(db, async () => {
			calls++;
			throw error;
		}),
	).rejects.toBe(error);
	expect(calls).toBe(1);
});

test("recovery cannot recreate a journal row for a withdrawing recipient", async () => {
	environment();
	const { recoverNotification } = await import(
		"../src/lib/notification-outbox.server"
	);
	const row = {
		$id: "n",
		$updatedAt: "1",
		status: "FAILED",
		claim: null,
		actorId: null,
		recipientId: "bob",
		attempts: 5,
	};
	const get = spyOn(TablesDB.prototype, "getRow").mockImplementation(
		async (args) => {
			if (
				typeof args !== "string" &&
				args.tableId === "account_lifecycle_anchors"
			)
				return { state: "PREPARING", $updatedAt: "1" } as never;
			return row as never;
		},
	);
	const begin = spyOn(
		TablesDB.prototype,
		"createTransaction",
	).mockResolvedValue({ $id: "tx" } as never);
	const update = spyOn(TablesDB.prototype, "updateRow").mockResolvedValue(
		row as never,
	);
	const end = spyOn(TablesDB.prototype, "updateTransaction").mockResolvedValue(
		{} as never,
	);
	const create = spyOn(TablesDB.prototype, "createRow").mockResolvedValue(
		{} as never,
	);
	try {
		await expect(recoverNotification("n", "retry")).rejects.toThrow();
		expect(create).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledWith({ transactionId: "tx", rollback: true });
	} finally {
		for (const spy of [get, begin, update, end, create]) spy.mockRestore();
	}
});
