import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";

// This adapter accepts only an explicitly authorized, protected projection, never a DB URL.
export const snapshotSchema = z.strictObject({
	version: z.literal(1),
	users: z.array(
		z.strictObject({
			id: z.string(),
			email: z.string().nullable(),
			emailVerified: z.boolean(),
			role: z.enum(["USER", "ADMIN"]),
			legacyPassword: z.string().nullable(),
			accounts: z.array(
				z.strictObject({
					providerId: z.string(),
					accountId: z.string(),
					password: z.string().nullable(),
				}),
			),
		}),
	),
});
export type SourceUser = z.infer<typeof snapshotSchema>["users"][number];
export async function readPrivate(path: string): Promise<unknown> {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const stat = await file.stat();
		if (
			!stat.isFile() ||
			(stat.mode & 0o077) !== 0 ||
			stat.uid !== process.getuid?.() ||
			stat.size > 64 * 1024 * 1024
		)
			throw new Error("unsafe_private_file");
		return JSON.parse(await file.readFile("utf8"));
	} finally {
		await file.close();
	}
}
export async function readSource(path: string, authorized: boolean) {
	if (!authorized) throw new Error("source_authorization_required");
	const parsed = snapshotSchema.safeParse(await readPrivate(path));
	if (!parsed.success) throw new Error("invalid_source_projection");
	return parsed.data.users;
}
export async function readAdminPolicy(path?: string): Promise<string[]> {
	if (!path) return [];
	const parsed = z.array(z.string()).safeParse(await readPrivate(path));
	if (!parsed.success || new Set(parsed.data).size !== parsed.data.length)
		throw new Error("invalid_admin_policy");
	return parsed.data;
}
