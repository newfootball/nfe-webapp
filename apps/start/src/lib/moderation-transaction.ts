// Persistence adapter is a genuine remote boundary; tests inject conflicts/failures here.
export async function moderationTransaction<T>(
	tx: {
		begin(): Promise<string>;
		commit(id: string): Promise<unknown>;
		rollback(id: string): Promise<unknown>;
	},
	run: (id: string) => Promise<T>,
) {
	const id = await tx.begin();
	try {
		const value = await run(id);
		await tx.commit(id);
		return value;
	} catch (error) {
		try {
			await tx.rollback(id);
		} catch {}
		throw error;
	}
}
export function sameRevision(
	before: {
		$id: string;
		$updatedAt: string;
		userId?: unknown;
		status?: unknown;
	},
	after: {
		$id: string;
		$updatedAt: string;
		userId?: unknown;
		status?: unknown;
	},
) {
	return (
		before.$id === after.$id &&
		before.$updatedAt === after.$updatedAt &&
		before.userId === after.userId &&
		before.status === after.status
	);
}
