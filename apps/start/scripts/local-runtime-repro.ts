import { release } from "./local-runtime";
import {
	appRoot,
	createPrivate,
	fileManifest,
	state,
} from "./local-runtime-state";

const inputBefore = await fileManifest(`${appRoot}/dist`);
const first = await release();
const inputBetween = await fileManifest(`${appRoot}/dist`);
const second = await release();
const inputAfter = await fileManifest(`${appRoot}/dist`);
process.stdout.write(`Release identities: ${first.digest} ${second.digest}\n`);
if (first.digest !== second.digest) {
	const left = await fileManifest(first.directory),
		right = await fileManifest(second.directory);
	const changedPaths = [
		...new Set([...Object.keys(left), ...Object.keys(right)]),
	]
		.sort()
		.filter((path) => left[path] !== right[path]);
	// Only credential-free source-build outputs may be uploaded for native CI diagnosis.
	const secrets = Object.entries(process.env)
		.filter(
			([key, value]) =>
				/secret|token|password|api.?key|private.?key/i.test(key) &&
				value &&
				value.length >= 12,
		)
		.map(([, value]) => value as string);
	for (const directory of [first.directory, second.directory]) {
		for (const path of Object.keys(await fileManifest(directory))) {
			const data = await Bun.file(`${directory}/${path}`).text();
			if (secrets.some((value) => data.includes(value)))
				throw new Error("Diagnostic output rejected by sensitive-value scan");
		}
	}
	await createPrivate(`${state}/repro-diagnostic.json`, {
		first: first.digest,
		second: second.digest,
		changedPaths,
		inputBefore,
		inputBetween,
		inputAfter,
		secretScan: "passed",
	});
	process.stdout.write(
		`Reproducibility failed in payload paths: ${changedPaths.join(", ")}\n`,
	);
	process.exit(1);
}
