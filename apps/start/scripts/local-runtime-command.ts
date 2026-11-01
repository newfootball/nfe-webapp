import { withDeadline } from "./local-runtime-cleanup";

export async function ownedCommand(
	args: string[],
	cwd: string,
	options: {
		timeoutMs?: number;
		signal?: AbortSignal;
		env?: Record<string, string | undefined>;
	} = {},
) {
	if (options.signal?.aborted) throw new Error("Owned command cancelled");
	if (!["darwin", "linux"].includes(process.platform))
		throw new Error("Local runtime supports POSIX process groups only");
	const child = Bun.spawn(args, {
		cwd,
		env: { ...(options.env ?? process.env), NODE_ENV: "production" },
		detached: true,
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = child.stdout.getReader(),
		err = child.stderr.getReader();
	let cancelled = false,
		timer: ReturnType<typeof setTimeout> | undefined;
	let rejectCancellation: (error: Error) => void = () => {};
	const cancellation = new Promise<never>((_, reject) => {
		rejectCancellation = reject;
	});
	const abort = () => {
		cancelled = true;
		rejectCancellation(new Error("Owned command deadline or cancellation"));
	};
	options.signal?.addEventListener("abort", abort, { once: true });
	if (options.signal?.aborted) abort();
	timer = setTimeout(abort, options.timeoutMs ?? 240_000);
	async function text(reader: ReadableStreamDefaultReader<Uint8Array>) {
		let result = "";
		const decoder = new TextDecoder();
		while (true) {
			const value = await reader.read();
			if (value.done) return result + decoder.decode();
			result += decoder.decode(value.value, { stream: true });
			if (result.length > 1024 * 1024)
				throw new Error("Owned command output bound exceeded");
		}
	}
	let result: [string, string, number] | undefined;
	let failed = false;
	try {
		result = await Promise.race([
			Promise.all([text(out), text(err), child.exited]),
			cancellation,
		]);
	} catch {
		failed = true;
	}
	clearTimeout(timer);
	options.signal?.removeEventListener("abort", abort);
	if (failed || cancelled || result?.[2] !== 0) {
		// Only this spawned child's detached group; never the user's group or Docker daemon.
		const kill = (signal: NodeJS.Signals) => {
			try {
				process.kill(-child.pid, signal);
			} catch {}
		};
		kill("SIGTERM");
		await Bun.sleep(25);
		kill("SIGKILL");
		await withDeadline(child.exited, 250).catch(() => {});
		await withDeadline(
			Promise.allSettled([out.cancel(), err.cancel()]),
			100,
		).catch(() => {});
		throw new Error(
			"Owned command failed or exceeded its bound; private payload suppressed",
		);
	}
	return result[0];
}
