import { rename, rm } from "node:fs/promises";
import { ownedCommand } from "./local-runtime-command";
import { requiredServices } from "./local-runtime-dependencies";
import {
	appRoot,
	composeArgs,
	createPrivate,
	endpoint,
	origin,
	project,
	state,
} from "./local-runtime-state";

export async function superviseDependencies(
	signal?: AbortSignal,
	directory = state,
) {
	const controller = new AbortController();
	const nonce = crypto.randomUUID();
	const file = `${directory}/dependencies.json`;
	let stopped = signal?.aborted ?? false;
	const abort = () => {
		stopped = true;
		controller.abort();
	};
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	async function inspect() {
		const temporary = `${directory}/dependencies-${nonce}.json`;
		try {
			const output = await ownedCommand(
				[...composeArgs, "ps", "--all", "--format", "json"],
				appRoot,
				{ timeoutMs: 4000, signal: controller.signal },
			);
			const parsed = output.trim().startsWith("[")
				? JSON.parse(output)
				: output
						.trim()
						.split("\n")
						.filter(Boolean)
						.map((line) => JSON.parse(line));
			const rows = parsed as {
				Project?: string;
				Service?: string;
				State?: string;
				Health?: string;
			}[];
			const services = requiredServices.map((name) => {
				const found = rows.filter(
					(row) => row.Project === project && row.Service === name,
				);
				const running = found.length === 1 && found[0]?.State === "running";
				// Worker container main-process availability only; not queue progress.
				const healthy =
					running &&
					(name.includes("worker-") || found[0]?.Health === "healthy");
				return { name, running, healthy };
			});
			if (stopped) return;
			await createPrivate(temporary, {
				format: 1,
				project,
				endpoint,
				origin,
				nonce,
				checkedAt: Date.now(),
				services,
			});
			if (!stopped) await rename(temporary, file);
		} catch {
			await rm(file, { force: true });
		} finally {
			await rm(temporary, { force: true });
		}
	}
	if (!stopped) await inspect();
	const loop = (async () => {
		while (!stopped) {
			try {
				await Bun.sleep(1000);
				if (!stopped) await inspect();
			} catch {
				/* fail closed; the report expires independently */
			}
		}
	})();
	return {
		env: {
			START_LOCAL_SUPERVISOR_DIRECTORY: directory,
			START_LOCAL_SUPERVISOR_NONCE: nonce,
		},
		async stop() {
			abort();
			signal?.removeEventListener("abort", abort);
			await loop;
			await rm(file, { force: true });
		},
	};
}
