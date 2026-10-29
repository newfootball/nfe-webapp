import { createHmac, randomBytes } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { readPrivate } from "./source";

const schema = z.strictObject({
	version: z.literal(1),
	key: z.string().regex(/^[a-f0-9]{64}$/),
	binding: z.string(),
	audit: z.array(
		z.strictObject({
			ref: z.string(),
			operation: z.enum(["admin_approved", "admin_applied"]),
		}),
	),
	entries: z.record(z.string(), z.enum(["intent", "owned", "done"])),
});
export type Checkpoint = z.infer<typeof schema>;
export const digest = (key: string, value: unknown) =>
	createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
export function fresh(): Checkpoint {
	return {
		version: 1,
		key: randomBytes(32).toString("hex"),
		binding: "",
		audit: [],
		entries: {},
	};
}
export async function load(path: string): Promise<Checkpoint> {
	try {
		const parsed = schema.safeParse(await readPrivate(path));
		if (!parsed.success) throw new Error("invalid_checkpoint");
		return parsed.data;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return fresh();
		throw error;
	}
}
export async function atomicPrivate(path: string, data: unknown) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${randomBytes(12).toString("hex")}.tmp`;
	try {
		const handle = await open(temp, "wx", 0o600);
		try {
			await handle.writeFile(`${JSON.stringify(data, null, "\t")}\n`);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await rename(temp, path);
		const directory = await open(dirname(path), "r");
		try {
			await directory.sync();
		} finally {
			await directory.close();
		}
	} finally {
		await rm(temp, { force: true });
	}
}
export async function withLock<T>(
	path: string,
	run: () => Promise<T>,
): Promise<T> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const lock = await open(`${path}.lock`, "wx", 0o600);
	try {
		await lock.writeFile(String(process.pid));
		return await run();
	} finally {
		await lock.close();
		await rm(`${path}.lock`);
	}
}
