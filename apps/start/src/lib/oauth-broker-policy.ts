import { resolveSubject } from "./oauth-registry";
// No public endpoint accepts a target ID. Only an accepted, signed subject reaches this seam.
export async function mappedSession<T>(
	registry: unknown,
	subject: string,
	currentId: string | null,
	dependencies: {
		target: (id: string) => Promise<{ status: boolean; mfa: boolean }>;
		issue: (id: string) => Promise<T>;
	},
) {
	const userId = resolveSubject(registry, subject, currentId);
	const target = await dependencies.target(userId);
	if (!target.status || target.mfa) throw new Error("Identity unavailable");
	return dependencies.issue(userId);
}
