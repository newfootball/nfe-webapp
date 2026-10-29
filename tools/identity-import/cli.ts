import { realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { atomicPrivate, fresh, load, withLock } from "./checkpoint";
import { runImport } from "./importer";
import { readAdminPolicy, readSource } from "./source";
import { AppwriteTarget, targetConfig } from "./target";

export async function main(args: string[]) {
	const { values } = parseArgs({
		args,
		strict: true,
		options: {
			source: { type: "string" },
			"source-authorized": { type: "boolean" },
			"dry-run": { type: "boolean" },
			apply: { type: "boolean" },
			checkpoint: { type: "string" },
			report: { type: "string" },
			"admin-policy": { type: "string" },
			"online-check": { type: "boolean" },
		},
	});
	if (
		!values.source ||
		!values.report ||
		(values.apply && values["dry-run"]) ||
		(values.apply && !values.checkpoint)
	)
		throw new Error("invalid_arguments");
	for (const key of [
		"source",
		"checkpoint",
		"report",
		"admin-policy",
	] as const) {
		if (values[key]) {
			const path = resolve(values[key]);
			values[key] = `${await realpath(dirname(path))}/${basename(path)}`;
		}
	}
	if (
		[
			values.source,
			values.checkpoint,
			values.report,
			values["admin-policy"],
		].filter(Boolean).length !==
		new Set(
			[
				values.source,
				values.checkpoint,
				values.report,
				values["admin-policy"],
			].filter(Boolean),
		).size
	)
		throw new Error("paths_must_differ");
	const users = await readSource(values.source, !!values["source-authorized"]);
	const admins = await readAdminPolicy(values["admin-policy"]);
	const endpoint = process.env.NFE_IDENTITY_ENDPOINT ?? "";
	const project = process.env.NFE_IDENTITY_PROJECT ?? "";
	const online = values.apply || values["online-check"];
	const binding = online ? targetConfig(endpoint, project) : "offline";
	if (online && !process.env.NFE_IDENTITY_KEY)
		throw new Error("target_key_required");
	const target = online
		? new AppwriteTarget(
				endpoint,
				project,
				process.env.NFE_IDENTITY_KEY as string,
			)
		: undefined;
	const run = async () => {
		const checkpoint = values.checkpoint
			? await load(values.checkpoint)
			: fresh();
		const report = await runImport({
			users,
			admins,
			target,
			targetBinding: binding,
			checkpoint,
			checkpointPath: values.checkpoint,
			apply: !!values.apply,
		});
		await atomicPrivate(values.report as string, report);
		process.stdout.write(
			`${JSON.stringify({ mode: report.mode, total: report.total, counts: report.counts })}\n`,
		);
		if (
			(report.counts.failed ?? 0) ||
			(report.counts.target_collision ?? 0) ||
			(report.counts.deferred ?? 0)
		)
			process.exitCode = 2;
	};
	if (values.apply) await withLock(values.checkpoint as string, run);
	else await run();
}
if (import.meta.main) {
	try {
		await main(Bun.argv.slice(2));
	} catch {
		process.stderr.write(
			"Identity import stopped; inspect protected inputs/configuration (details suppressed).\n",
		);
		process.exitCode = 1;
	}
}
