import "@tanstack/react-start/server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "redis";
import { configuration } from "./auth-context.server";

export const randomSecret = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const redisConnection = (url: string) =>
	createClient({
		url,
		socket: { connectTimeout: 3000, reconnectStrategy: false },
		disableOfflineQueue: true,
	});
async function shared<T>(
	run: (
		client: ReturnType<typeof redisConnection>,
		prefix: string,
	) => Promise<T>,
) {
	const config = configuration();
	const url = process.env.START_OAUTH_REDIS_URL;
	if (!url) throw new Error("Shared authentication state unavailable");
	const parsed = new URL(url);
	if (
		parsed.protocol !== "rediss:" &&
		!(
			process.env.START_AUTH_ALLOW_HTTP_LOOPBACK === "true" &&
			parsed.protocol === "redis:" &&
			["localhost", "127.0.0.1"].includes(parsed.hostname)
		)
	)
		throw new Error("Protected Redis required");
	const client = redisConnection(url);
	client.on("error", () => {}); // Never log connection credentials or challenge payloads.
	try {
		await client.connect();
		return await run(
			client,
			`nfe:auth52:${digest(`${config.origin}|${config.project}`)}:`,
		);
	} finally {
		if (client.isOpen) client.destroy();
	}
}
export async function saveState(
	kind: string,
	handle: string,
	value: unknown,
	ttl: number,
) {
	return shared(async (client, prefix) => {
		const saved = await client.set(
			`${prefix}${kind}:${digest(handle)}`,
			JSON.stringify(value),
			{ EX: ttl, NX: true },
		);
		if (!saved) throw new Error("State collision");
	});
}
export async function consumeState(
	kind: string,
	handle: string,
): Promise<unknown> {
	return shared(async (client, prefix) => {
		const result = await client.getDel(`${prefix}${kind}:${digest(handle)}`);
		return result ? JSON.parse(result) : null;
	});
}
// Fixed shared windows, no API-key bypass and no untrusted forwarded-IP identity.
// Global caps deliberately fail closed for all instances, including unknown targets.
export async function limit(
	action: string,
	target: string,
	cap = 5,
	seconds = 900,
) {
	return shared(async (client, prefix) => {
		const result = await client.eval(
			"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
			{
				keys: [`${prefix}limit:${action}:${digest(target)}`],
				arguments: [String(seconds)],
			},
		);
		if (Number(result) > cap) throw new Error("Request unavailable");
	});
}
export async function requestLimit(action: string, target: string) {
	await limit("global", "all", 100, 60);
	await limit(action, target);
}
