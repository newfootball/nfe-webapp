// Graceful drain shared by the local runner (server.ts) and the production entry.
// In-flight requests finish first; a bounded deadline closes stuck clients.
type Stoppable = {
	stop(closeActiveConnections?: boolean): Promise<void> | void;
};

export function installGracefulShutdown(
	server: Stoppable,
	options: { deadlineMs?: number; log?: (event: string) => void } = {},
) {
	const deadlineMs = options.deadlineMs ?? 10_000;
	let draining = false;
	async function shutdown(signal: string) {
		if (draining) return;
		draining = true;
		options.log?.(`drain signal=${signal} deadlineMs=${deadlineMs}`);
		const deadline = setTimeout(() => {
			void server.stop(true);
		}, deadlineMs);
		deadline.unref();
		await server.stop(false);
		clearTimeout(deadline);
		options.log?.("stopped");
		process.exit(0);
	}
	process.once("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
	process.once("SIGINT", () => {
		void shutdown("SIGINT");
	});
	return { isDraining: () => draining, shutdown };
}
