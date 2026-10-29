import { z } from "zod";
export const GOOGLE_ISSUER = "https://accounts.google.com";
export const registrySchema = z
	.strictObject({
		version: z.literal(1),
		sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
		coverageComplete: z.boolean(),
		identities: z.array(
			z.strictObject({
				issuer: z.literal(GOOGLE_ISSUER),
				provider: z.literal("google"),
				subject: z.string().min(1).max(255),
				userId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/),
			}),
		),
	})
	.superRefine((registry, context) => {
		const subjects = new Set<string>();
		const users = new Set<string>();
		for (const item of registry.identities) {
			if (subjects.has(item.subject) || users.has(item.userId))
				context.addIssue({ code: "custom", message: "Ambiguous registry" });
			subjects.add(item.subject);
			users.add(item.userId);
		}
	});
export function resolveSubject(
	raw: unknown,
	subject: string,
	currentId: string | null,
) {
	const registry = registrySchema.parse(raw);
	const match = registry.identities.find((entry) => entry.subject === subject);
	if (!match || (currentId && currentId !== match.userId))
		throw new Error("Identity unavailable");
	return match.userId;
}
