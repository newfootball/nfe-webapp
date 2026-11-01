import { rm } from "node:fs/promises";
import { cleanupAll, stopOwnedProcess } from "./local-runtime-cleanup";
import { state } from "./local-runtime-state";
import { superviseDependencies } from "./local-runtime-supervisor";

export function foregroundCancellation() {
	const controller = new AbortController();
	const stop = () => controller.abort();
	process.once("SIGTERM", stop);
	process.once("SIGINT", stop);
	return {
		signal: controller.signal,
		dispose() {
			process.off("SIGTERM", stop);
			process.off("SIGINT", stop);
		},
	};
}
export async function launchRuntime(
	directory: string,
	config: Record<string, string>,
	log?: string,
	options: { signal?: AbortSignal; stateDirectory?: string } = {},
) {
	const controller = new AbortController();
	const abort = () => controller.abort();
	options.signal?.addEventListener("abort", abort, { once: true });
	if (options.signal?.aborted) abort();
	const supervisor = await superviseDependencies(
		controller.signal,
		options.stateDirectory ?? state,
	);
	let app: ReturnType<typeof Bun.spawn> | undefined,
		consumer: ReturnType<typeof Bun.spawn> | undefined;
	async function stop() {
		controller.abort();
		options.signal?.removeEventListener("abort", abort);
		return await cleanupAll([
			{
				name: "app",
				timeoutMs: 18_000,
				run: async () => {
					if (app && app.exitCode === null) await stopOwnedProcess(app);
				},
			},
			{
				name: "consumer",
				timeoutMs: 18_000,
				run: async () => {
					if (consumer && consumer.exitCode === null)
						await stopOwnedProcess(consumer);
					await rm(
						`${supervisor.env.START_LOCAL_SUPERVISOR_DIRECTORY}/consumer.json`,
						{ force: true },
					);
				},
			},
			{ name: "supervisor", timeoutMs: 6000, run: () => supervisor.stop() },
		]);
	}
	try {
		if (controller.signal.aborted) throw new Error("Runtime startup cancelled");
		app = Bun.spawn([process.execPath, `${directory}/server.ts`], {
			cwd: directory,
			env: { ...config, ...supervisor.env },
			stdout: log ? Bun.file(log) : "ignore",
			stderr: log ? Bun.file(log) : "ignore",
		});
		const env = Object.fromEntries(
			[
				"NODE_ENV",
				"START_LOCAL_RUNTIME",
				"START_APP_ORIGIN",
				"START_APPWRITE_ENDPOINT",
				"START_APPWRITE_PROJECT",
				"START_APPWRITE_DATABASE",
				"START_APPWRITE_SESSION_KEY",
				"START_AUTH_ALLOW_HTTP_LOOPBACK",
				"START_APPWRITE_NOTIFICATION_WRITER_KEY",
				"START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY",
				"START_ACCOUNT_DELETION_SYNTHETIC_PROJECT",
			].map((key) => [key, config[key]]),
		);
		consumer = Bun.spawn(
			[process.execPath, `${directory}/scripts/local-runtime-consumer.ts`],
			{
				cwd: directory,
				env: {
					...env,
					...supervisor.env,
					START_LOCAL_APP_PID: String(app.pid),
					START_LOCAL_PARENT_PID: String(process.pid),
				},
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		const ownedApp = app,
			ownedConsumer = consumer;
		return {
			app,
			consumer,
			supervisor,
			stop,
			async wait() {
				if (controller.signal.aborted) throw new Error("Foreground stopped");
				let rejectAbort: (reason: Error) => void = () => {};
				const cancelled = new Promise<never>((_, reject) => {
					rejectAbort = reject;
				});
				const onAbort = () => rejectAbort(new Error("Foreground stopped"));
				controller.signal.addEventListener("abort", onAbort, { once: true });
				try {
					return await Promise.race([
						ownedApp.exited,
						ownedConsumer.exited.then(() => {
							throw new Error("Local consumer exited");
						}),
						cancelled,
					]);
				} finally {
					controller.signal.removeEventListener("abort", onAbort);
				}
			},
		};
	} catch (error) {
		await stop();
		throw error;
	}
}
