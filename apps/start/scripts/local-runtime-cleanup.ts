export type CleanupAction = {
	name: string;
	timeoutMs: number;
	run: (signal: AbortSignal) => Promise<unknown>;
};
export async function cleanupAll(actions: CleanupAction[]) {
	const results = [];
	for (const action of actions) {
		results.push(
			await (async () => {
				const controller = new AbortController();
				let timeout: ReturnType<typeof setTimeout> | undefined;
				try {
					await Promise.race([
						action.run(controller.signal),
						new Promise((_, reject) => {
							timeout = setTimeout(() => {
								controller.abort();
								reject(new Error("timeout"));
							}, action.timeoutMs);
						}),
					]);
					return { name: action.name, ok: true };
				} catch {
					return {
						name: action.name,
						ok: false,
						error: controller.signal.aborted ? "timeout" : "failed",
					};
				} finally {
					clearTimeout(timeout);
				}
			})(),
		);
	}
	return results;
}
export async function stopOwnedProcess(child: ReturnType<typeof Bun.spawn>) {
	child.kill("SIGTERM");
	try {
		return await withDeadline(child.exited, 12_000);
	} catch {
		child.kill("SIGKILL");
		return await withDeadline(child.exited, 3000);
	}
}
export async function withDeadline<T>(
	work: Promise<T>,
	milliseconds: number,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error("deadline")), milliseconds);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}
