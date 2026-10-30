// Dedicated synthetic subprocess: parent deliberately SIGKILLs after a journaled boundary.
import { chmod } from "node:fs/promises";
import type { Models } from "node-appwrite";
import { consumeNotifications } from "../src/lib/notification-outbox.server";
import { state } from "./notification-local";

const phase = process.argv[2],
	nonce = process.argv[3];
if (
	process.env.NFE_NOTIFICATIONS_SYNTHETIC !== "1" ||
	process.env.START_APPWRITE_DATABASE !== "notifications-proof" ||
	process.env.START_APPWRITE_PROJECT !== "nfe-notifications" ||
	!["claim", "fence", "ack"].includes(phase ?? "") ||
	!nonce ||
	!/^[a-f0-9-]{36}$/.test(nonce)
)
	throw new Error("Dedicated fault worker only");
async function pause(row: Models.DefaultRow, transactionId?: string) {
	const path = `${state}/fault-${nonce}.json`;
	await Bun.write(
		path,
		JSON.stringify({
			phase,
			rowId: row.$id,
			claim: row.claim,
			leaseUntil: row.leaseUntil,
			transactionId: transactionId ?? null,
		}),
	);
	await chmod(path, 0o600);
	// Bounded last resort if the supervising proof process dies; this is not a daemon.
	await Bun.sleep(120000);
	throw new Error("Fault worker was not terminated by proof");
}
await consumeNotifications(1, {
	afterClaim: phase === "claim" ? pause : undefined,
	afterFence: phase === "fence" ? pause : undefined,
	beforeAck: phase === "ack" ? pause : undefined,
});
throw new Error("Expected boundary not reached");
