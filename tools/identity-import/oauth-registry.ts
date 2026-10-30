import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { z } from "zod";
import { readPrivate } from "./source";

// Explicit source-owned projection: User.id + Account.providerId/accountId only.
// Emails, password hashes and every historical token are rejected, not exported.
export const providerSourceSchema = z.strictObject({
	version: z.literal(1),
	users: z.array(
		z.strictObject({
			id: z.string(),
			accounts: z.array(
				z.strictObject({ providerId: z.string(), accountId: z.string() }),
			),
		}),
	),
});
type ProviderUser = z.infer<typeof providerSourceSchema>["users"][number];
export function providerRegistry(users: ProviderUser[], sourceDigest: string) {
	const subjects = new Set<string>();
	const targets = new Set<string>();
	const identities: {
		issuer: string;
		provider: string;
		subject: string;
		userId: string;
	}[] = [];
	for (const user of users)
		for (const account of user.accounts) {
			if (account.providerId !== "google") continue;
			if (
				!account.accountId ||
				account.accountId.length > 255 ||
				!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(user.id) ||
				subjects.has(account.accountId) ||
				targets.has(user.id)
			)
				throw new Error("ambiguous_provider_registry");
			subjects.add(account.accountId);
			targets.add(user.id);
			identities.push({
				issuer: "https://accounts.google.com",
				provider: "google",
				subject: account.accountId,
				userId: user.id,
			});
		}
	return { version: 1, sourceDigest, coverageComplete: false, identities };
}
if (import.meta.main) {
	const [source, output, authorization] = Bun.argv.slice(2);
	if (
		!source ||
		!output ||
		authorization !== "--authorized-private-source" ||
		resolve(output) === resolve(source)
	)
		throw new Error("Use source output --authorized-private-source");
	const root = await realpath(resolve(import.meta.dir, "../.."));
	const directory = await realpath(dirname(resolve(output)));
	if (directory === root || directory.startsWith(`${root}${sep}`))
		throw new Error("Registry must remain outside the checkout");
	const projection = providerSourceSchema.safeParse(await readPrivate(source));
	if (!projection.success) throw new Error("invalid_provider_projection");
	const registry = providerRegistry(
		projection.data.users,
		createHash("sha256").update(JSON.stringify(projection.data)).digest("hex"),
	);
	const file = await open(
		output,
		constants.O_WRONLY |
			constants.O_CREAT |
			constants.O_EXCL |
			constants.O_NOFOLLOW,
		0o600,
	);
	try {
		await file.writeFile(`${JSON.stringify(registry)}\n`);
	} finally {
		await file.close();
	}
	process.stdout.write(
		"Private registry written; incomplete coverage, unknown subjects remain denied.\n",
	);
}
