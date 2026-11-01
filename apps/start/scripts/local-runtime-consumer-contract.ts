import { lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

export const consumerReportSchema = z.strictObject({
	format: z.literal(1),
	project: z.literal("nfe-local-runtime-64"),
	endpoint: z.literal("http://127.0.0.1:18464/v1"),
	origin: z.literal("http://127.0.0.1:3564"),
	nonce: z.uuid(),
	parentPid: z.number().int().positive(),
	appPid: z.number().int().positive(),
	checkedAt: z.number().int().nonnegative(),
	state: z.enum(["ready", "failed", "stopped"]),
	counters: z.strictObject({
		examined: z.number().int().nonnegative(),
		delivered: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
		permanentFailures: z.number().int().nonnegative(),
	}),
});
export function consumerReady(
	value: unknown,
	nonce: string,
	appPid: number,
	parentPid: number,
	now = Date.now(),
) {
	const report = consumerReportSchema.safeParse(value);
	return (
		report.success &&
		report.data.nonce === nonce &&
		report.data.appPid === appPid &&
		report.data.parentPid === parentPid &&
		report.data.checkedAt <= now &&
		now - report.data.checkedAt <= 10_000 &&
		report.data.state === "ready" &&
		report.data.counters.permanentFailures === 0
	);
}
export async function readConsumerReport() {
	const directory = process.env.START_LOCAL_SUPERVISOR_DIRECTORY,
		nonce = process.env.START_LOCAL_SUPERVISOR_NONCE;
	if (
		!directory ||
		!isAbsolute(directory) ||
		!directory.endsWith("/.local-runtime") ||
		!nonce
	)
		return false;
	const info = await lstat(join(directory, "consumer.json"));
	if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600)
		return false;
	return consumerReady(
		await Bun.file(join(directory, "consumer.json")).json(),
		nonce,
		process.pid,
		process.ppid,
	);
}
