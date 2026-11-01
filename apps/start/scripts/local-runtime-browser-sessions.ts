import assert from "node:assert/strict";

export async function revokeCreatedSessions(
	baseline: readonly string[],
	read: () => Promise<{ total: number; sessions: { $id: string }[] }>,
	remove: (id: string) => Promise<void>,
) {
	const before = new Set(baseline);
	const current = await read();
	assert.equal(
		current.sessions.length,
		current.total,
		"Incomplete session enumeration",
	);
	for (const session of current.sessions)
		if (!before.has(session.$id)) await remove(session.$id);
	const remaining = await read();
	assert.equal(
		remaining.sessions.length,
		remaining.total,
		"Incomplete session enumeration",
	);
	assert.ok(
		remaining.sessions.every((session) => before.has(session.$id)),
		"Proof session remains active",
	);
}
