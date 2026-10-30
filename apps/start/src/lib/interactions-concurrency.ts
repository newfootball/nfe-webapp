export class InteractionRevisionConflict extends Error {}
export const INTERACTION_ATTEMPTS = 8;
// Retry a fresh authorized operation, never a stale transaction. A real visibility
// revocation is not retryable. Bounded backoff avoids a tight conflicting loop.
export async function retryInteraction<T>(
	run: () => Promise<T>,
	retryable: (error: unknown) => boolean,
	pause = (ms: number) =>
		new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (!retryable(error) || attempt >= INTERACTION_ATTEMPTS - 1) throw error;
			await pause(10 * (attempt + 1));
		}
	}
}
