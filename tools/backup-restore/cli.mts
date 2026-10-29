import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { openArchive } from "./archive.mts";
import { identity } from "./core.mts";
import { recover } from "./recovery.mts";
import { destroy } from "./topology.mts";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	strict: true,
	options: {
		action: { type: "string" },
		archive: { type: "string" },
		target: { type: "string" },
		"confirm-target": { type: "string" },
		"b2-env": { type: "string" },
		run: { type: "boolean" },
	},
});
try {
	if (!values.run)
		console.log(
			"dry_run: no archive read, no Docker or B2 mutation; add --run and explicit target confirmation",
		);
	else if (values.action === "inspect") {
		assert.ok(values.archive);
		const archive = await openArchive(values.archive);
		console.log(
			JSON.stringify({
				synthetic: true,
				volumes: Object.keys(archive.volumes).length,
				versions: archive.media.versions.length,
				createdAt: archive.createdAt,
			}),
		);
	} else {
		assert.ok(values.target);
		identity(values.target);
		assert.equal(values["confirm-target"], values.target);
		if (values.action === "restore") {
			assert.ok(values.archive && values["b2-env"]);
			await recover(
				values.archive,
				values.target,
				values["confirm-target"]!,
				values["b2-env"],
			);
			console.log(
				"isolated_restore_complete: verify business behavior before acceptance",
			);
		} else if (values.action === "destroy") {
			await destroy(values.target);
			console.log("owned_docker_project_removed; protected archive retained");
		} else throw new Error("unknown_action");
	}
} catch {
	console.error(
		"backup_restore_failed: details suppressed to protect configuration, identities and media",
	);
	process.exitCode = 1;
}
