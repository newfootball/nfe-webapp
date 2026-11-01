import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";

export const requiredServices = [
	"appwrite",
	"appwrite-worker-databases",
	"appwrite-worker-deletes",
	"redis",
	"postgresql",
	"appwrite-geo",
] as const;
export const dependencyReportSchema = z.strictObject({
	format: z.literal(1),
	project: z.literal("nfe-local-runtime-64"),
	endpoint: z.literal("http://127.0.0.1:18464/v1"),
	origin: z.literal("http://127.0.0.1:3564"),
	nonce: z.uuid(),
	checkedAt: z.number().int().nonnegative(),
	services: z
		.array(
			z.strictObject({
				name: z.enum(requiredServices),
				running: z.boolean(),
				healthy: z.boolean(),
			}),
		)
		.length(6),
});
export function reportReady(value: unknown, nonce: string, now = Date.now()) {
	const report = dependencyReportSchema.safeParse(value);
	if (
		!report.success ||
		report.data.nonce !== nonce ||
		report.data.checkedAt > now ||
		now - report.data.checkedAt > 10_000
	)
		return false;
	return requiredServices.every(
		(name) =>
			report.data.services.filter(
				(service) =>
					service.name === name && service.running && service.healthy,
			).length === 1,
	);
}
export async function readDependencyReport() {
	const directory = process.env.START_LOCAL_SUPERVISOR_DIRECTORY;
	const nonce = process.env.START_LOCAL_SUPERVISOR_NONCE;
	if (
		!directory ||
		!isAbsolute(directory) ||
		!directory.endsWith("/.local-runtime") ||
		!nonce
	)
		return false;
	const parent = await lstat(directory);
	if (
		!parent.isDirectory() ||
		parent.isSymbolicLink() ||
		(parent.mode & 0o777) !== 0o700
	)
		return false;
	const path = join(directory, "dependencies.json");
	if (dirname(path) !== directory) return false;
	const info = await lstat(path);
	if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600)
		return false;
	return reportReady(await Bun.file(path).json(), nonce);
}
