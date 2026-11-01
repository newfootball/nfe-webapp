// Private foreground child only; no RPC, scheduler or business implementation here.
import { open, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Query } from "node-appwrite";
import { consumeAccountDeletions } from "../src/lib/account-deletion.server";
import {
	consumeNotifications,
	notificationConnection,
} from "../src/lib/notification-outbox.server";
import { DeadlineExceeded, withDeadline } from "./local-runtime-cleanup";
import { consumerReportSchema } from "./local-runtime-consumer-contract";

const directory = process.env.START_LOCAL_SUPERVISOR_DIRECTORY;
const nonce = process.env.START_LOCAL_SUPERVISOR_NONCE;
const parentPid = Number(process.env.START_LOCAL_PARENT_PID),
	appPid = Number(process.env.START_LOCAL_APP_PID);
if (
	process.env.START_LOCAL_RUNTIME !== "1" ||
	process.env.START_APPWRITE_ENDPOINT !== "http://127.0.0.1:18464/v1" ||
	process.env.START_APPWRITE_PROJECT !== "nfe-local" ||
	process.env.START_APPWRITE_DATABASE !== "nfe-local" ||
	!directory ||
	!isAbsolute(directory) ||
	!directory.endsWith("/.local-runtime") ||
	!nonce ||
	!Number.isSafeInteger(parentPid) ||
	parentPid <= 0 ||
	!Number.isSafeInteger(appPid) ||
	appPid <= 0 ||
	process.ppid !== parentPid
)
	throw new Error("Owned local consumer configuration required");
const file = join(directory, "consumer.json"),
	temporary = join(directory, `consumer-${nonce}.json`);
let stopping = false;
const stop = () => {
	stopping = true;
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const counters = { examined: 0, delivered: 0, failed: 0, permanentFailures: 0 };
async function report(state: "ready" | "failed" | "stopped") {
	const value = consumerReportSchema.parse({
		format: 1,
		project: "nfe-local-runtime-64",
		endpoint: "http://127.0.0.1:18464/v1",
		origin: "http://127.0.0.1:3564",
		nonce,
		parentPid,
		appPid,
		checkedAt: Date.now(),
		state,
		counters,
	});
	const handle = await open(temporary, "wx", 0o600);
	try {
		await handle.writeFile(JSON.stringify(value));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await rename(temporary, file);
}
// If its foreground owner/app disappears, this child never becomes an orphan daemon.
const ownership = setInterval(() => {
	try {
		if (process.ppid !== parentPid) stop();
		process.kill(parentPid, 0);
		process.kill(appPid, 0);
	} catch {
		stop();
	}
}, 500);
try {
	while (!stopping) {
		try {
			await withDeadline(consumeAccountDeletions(1), 20000);
			const result = await withDeadline(consumeNotifications(1), 8000);
			counters.examined += result.examined;
			counters.delivered += result.delivered;
			counters.failed += result.failed;
			const c = notificationConnection();
			const failed = await withDeadline(
				c.db.listRows({
					databaseId: c.databaseId,
					tableId: "notification_outbox_v1",
					queries: [Query.equal("status", "FAILED"), Query.limit(1)],
				}),
				3000,
			);
			counters.permanentFailures = failed.total;
			await report(result.failed || failed.total ? "failed" : "ready");
		} catch (error) {
			counters.failed++;
			await report("failed");
			// Exit aborts any timed-out SDK I/O; Appwrite's durable claims/retry remain authoritative.
			if (error instanceof DeadlineExceeded) {
				process.exitCode = 1;
				break;
			}
		}
		if (!stopping) await Bun.sleep(1000);
	}
} finally {
	clearInterval(ownership);
	process.off("SIGTERM", stop);
	process.off("SIGINT", stop);
	await report("stopped");
	await rm(temporary, { force: true });
}
if (process.exitCode) process.exit(process.exitCode);
