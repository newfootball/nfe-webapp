// Explicit local operator command. This does not schedule or publish notifications.
import {
	consumeNotifications,
	recoverNotification,
} from "../src/lib/notification-outbox.server";

if (
	process.env.NFE_NOTIFICATIONS_SYNTHETIC !== "1" ||
	process.env.START_APPWRITE_DATABASE !== "notifications-proof" ||
	process.env.START_APPWRITE_PROJECT !== "nfe-notifications" ||
	process.env.START_APPWRITE_ENDPOINT !== "http://127.0.0.1:18158/v1"
)
	throw new Error("Dedicated synthetic notification environment required");
const command = process.argv[2];
if (command === "consume")
	process.stdout.write(`${JSON.stringify(await consumeNotifications())}\n`);
else if (command === "recover" && process.argv[3] && process.argv[4]) {
	await recoverNotification(process.argv[3], process.argv[4]);
	process.stdout.write("Recovery journaled\n");
} else throw new Error("Use consume or recover <outboxId> <reason>");
