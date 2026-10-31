// Synthetic proof process only: replace the external signing boundary, never app RPCs.
// No B2 request/object/capability is produced; real Appwrite guards run unchanged.
import { mock } from "bun:test";

const control = process.env.NFE_MODERATION_PROXY_CONTROL;
const token = process.env.NFE_MODERATION_PROXY_TOKEN;
if (
	process.env.NFE_MODERATION_SYNTHETIC !== "1" ||
	!control ||
	!token ||
	new URL(control).hostname !== "127.0.0.1"
)
	throw new Error("Dedicated signing proof opt-in required");
mock.module("@aws-sdk/s3-request-presigner", () => ({
	getSignedUrl: async (
		_client: unknown,
		command: { input: { Key?: string } },
	) => {
		const r = await fetch(new URL("/signature", control), {
			method: "POST",
			headers: { "x-proof-token": token, "content-type": "application/json" },
			body: JSON.stringify({ key: command.input.Key }),
		});
		if (!r.ok) throw new Error("Synthetic signing boundary failed");
		return ((await r.json()) as { url: string }).url;
	},
}));
