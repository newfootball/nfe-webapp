import { rename, rm } from "node:fs/promises";
import { command, composeArgs } from "./local-runtime";
import { requiredServices } from "./local-runtime-dependencies";
import {
	createPrivate,
	endpoint,
	origin,
	project,
	state,
} from "./local-runtime-state";

export async function superviseDependencies() {
	const controller = new AbortController();
	const nonce = crypto.randomUUID();
	const file = `${state}/dependencies.json`;
	let stopped = false;
	async function inspect() {
		const temporary = `${state}/dependencies-${nonce}.json`;
		try {
			const output = await command(
				[...composeArgs, "ps", "--all", "--format", "json"],
				undefined,
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
	await inspect();
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
			START_LOCAL_SUPERVISOR_DIRECTORY: state,
			START_LOCAL_SUPERVISOR_NONCE: nonce,
		},
		async stop() {
			stopped = true;
			controller.abort();
			await loop;
			await rm(file, { force: true });
		},
	};
}
