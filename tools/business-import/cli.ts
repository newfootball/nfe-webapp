import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { Query } from "node-appwrite";
import { z } from "zod";
import { atomicPrivate, load, withLock } from "../identity-import/checkpoint";
import {
	plan as identityPlan,
	runImport as importIdentities,
} from "../identity-import/importer";
import { providerRegistry } from "../identity-import/oauth-registry";
import {
	readAdminPolicy,
	readSource as readIdentities,
	readPrivate,
	readPrivateText,
	type SourceUser,
} from "../identity-import/source";
import {
	AppwriteTarget as IdentityTarget,
	targetConfig,
} from "../identity-import/target";
import {
	type AcceptedLoss,
	candidateManifest,
	evaluateAcceptedLoss,
	parseManifest,
	sourceDigest,
} from "./accepted-loss";
import { BUSINESS_TABLES, normalizeRow } from "./contract";
import { prepareMedia } from "./download";
import { preflightIdentities, rebaseIdentities } from "./identities";
import { createMediaPlan } from "./media-plan";
import { omitUnavailableMedia } from "./omission";
import { type ProjectionRow, projectBusiness } from "./projection";
import {
	type Reconciliation,
	reconcile,
	redactReconciliation,
} from "./reconcile";
import { assertOwnedTarget, runImport as importRows } from "./runner";
import { type BusinessSource, projectSource } from "./source";
import { AppwriteTarget, targetBinding } from "./target";
import { assertStorageOwned, importStorage, uploadMedia } from "./upload";

const configSchema = z.strictObject({
	endpoint: z.string(),
	project: z.string(),
	database: z.string(),
	key: z.string().min(1),
	production: z
		.strictObject({
			endpoint: z.string(),
			project: z.string(),
			database: z.string(),
		})
		.optional(),
	media: z.strictObject({
		allowedHosts: z.array(z.string()),
		bucket: z.string(),
		prefix: z.string(),
	}),
	b2: z.strictObject({
		B2_BUCKET_NAME: z.string(),
		B2_REGION: z.string(),
		B2_ENDPOINT: z.string(),
		B2_APPLICATION_KEY_ID: z.string(),
		B2_APPLICATION_KEY: z.string(),
	}),
});
type Config = z.infer<typeof configSchema>;
const TABLES = BUSINESS_TABLES;
type Args = {
	source: string;
	identity: string;
	adminPolicy: string;
	config: string;
	directory: string;
	acceptedLoss: string | null;
	apply: boolean;
	offline: boolean;
	rebuild: boolean;
	frozen: boolean;
	productionTarget: boolean;
};
export function parseArgs(args: string[]): Args {
	const fields: Record<string, string> = {},
		flags = new Set<string>();
	const required = [
			"--source",
			"--identity",
			"--admin-policy",
			"--config",
			"--directory",
		],
		valueArgs = new Set([...required, "--accepted-loss"]),
		switches = new Set([
			"--source-authorized",
			"--dry-run",
			"--apply",
			"--offline",
			"--freeze-confirmed",
			"--rebuild",
			"--production-target",
		]);
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) throw new Error("invalid_arguments");
		if (valueArgs.has(arg)) {
			const value = args[++i];
			if (!value || value.startsWith("--") || fields[arg])
				throw new Error("invalid_arguments");
			fields[arg] = value;
		} else if (switches.has(arg) && !flags.has(arg)) flags.add(arg);
		else throw new Error("invalid_arguments");
	}
	if (
		!flags.has("--source-authorized") ||
		required.some((k) => !fields[k]) ||
		(flags.has("--apply") &&
			(flags.has("--dry-run") || flags.has("--offline"))) ||
		(flags.has("--rebuild") &&
			(!flags.has("--freeze-confirmed") || !flags.has("--apply"))) ||
		(flags.has("--freeze-confirmed") && !flags.has("--rebuild"))
	)
		throw new Error("invalid_arguments");
	return {
		source: fields["--source"] as string,
		identity: fields["--identity"] as string,
		adminPolicy: fields["--admin-policy"] as string,
		config: fields["--config"] as string,
		directory: fields["--directory"] as string,
		acceptedLoss: fields["--accepted-loss"] ?? null,
		apply: flags.has("--apply"),
		offline: flags.has("--offline"),
		rebuild: flags.has("--rebuild"),
		frozen: flags.has("--freeze-confirmed"),
		productionTarget: flags.has("--production-target"),
	};
}
// The production target is only accepted when the flag and the configuration
// name the same endpoint, project and database; either one alone is rejected.
export function resolveTarget(config: Config, productionTarget: boolean) {
	const production = config.production ?? null;
	if (productionTarget !== (production !== null))
		throw new Error("production_target_mismatch");
	if (
		production &&
		(production.endpoint !== config.endpoint ||
			production.project !== config.project ||
			production.database !== config.database)
	)
		throw new Error("production_target_mismatch");
	const binding = { production: productionTarget };
	const identity = productionTarget
		? { production: true }
		: { isolatedBusinessImport: true };
	targetBinding(config.endpoint, config.project, config.database, binding);
	targetConfig(config.endpoint, config.project, identity);
	return { binding, identity, production: productionTarget };
}
export function validateInputs(
	source: BusinessSource,
	users: SourceUser[],
	admins: string[],
) {
	if (
		source.User.length !== users.length ||
		new Set(users.map((u) => u.id)).size !== users.length ||
		new Set(admins).size !== admins.length
	)
		throw new Error("identity_source_mismatch");
	const byId = new Map(users.map((u) => [u.id, u]));
	for (const user of source.User) {
		const identity = byId.get(user.id);
		if (
			!identity ||
			identity.email !== user.email ||
			identity.role !== user.role ||
			identity.emailVerified !== user.emailVerified
		)
			throw new Error("identity_source_mismatch");
	}
	if (
		admins.some((id) => !users.some((u) => u.id === id && u.role === "ADMIN"))
	)
		throw new Error("admin_policy_mismatch");
	const planned = identityPlan(users, admins, true, true);
	return {
		eligible: planned.filter((item) => item.reasons.length === 0).length,
		deferred: planned.filter((item) => item.reasons.length > 0).length,
	};
}
// Quarantined media only pass when the accepted-loss manifest covers each pair
// exactly and the derived media set is complete; a stale manifest blocks even
// when nothing is quarantined any more.
export type ApplyRefusal =
	| "dry_run"
	| "offline"
	| "deferred_identities"
	| "stale_manifest"
	| "unaccepted_loss"
	| "derived_incomplete";
export function applyRefusal(
	apply: boolean,
	offline: boolean,
	quarantined: number,
	deferred: number,
	loss: { ok: boolean; stale: number } = { ok: quarantined === 0, stale: 0 },
	derivedComplete = quarantined === 0,
): ApplyRefusal | null {
	if (!apply) return "dry_run";
	if (offline) return "offline";
	if (deferred) return "deferred_identities";
	if (loss.stale) return "stale_manifest";
	if (!loss.ok) return "unaccepted_loss";
	if (quarantined && !derivedComplete) return "derived_incomplete";
	return null;
}
export const mayApply = (...args: Parameters<typeof applyRefusal>) =>
	applyRefusal(...args) === null;
// The development bucket and prefix never back a production target; the
// production storage binding belongs to #66.
export const DEVELOPMENT_STORAGE = {
	bucket: "nfe-webapp-dev",
	prefix: "nfe-import-63/",
};
export function assertStorageBinding(
	media: { bucket: string; prefix: string },
	production: boolean,
	apply: boolean,
) {
	if (
		production &&
		apply &&
		(media.bucket === DEVELOPMENT_STORAGE.bucket ||
			media.prefix.startsWith(DEVELOPMENT_STORAGE.prefix))
	)
		throw new Error("production_storage_binding_required");
}
async function privateDirectory(directory: string) {
	if (!isAbsolute(directory)) throw new Error("private_directory_required");
	const path = await realpath(directory),
		stat = await lstat(path),
		repo = await realpath(join(import.meta.dir, "../.."));
	if (
		!stat.isDirectory() ||
		stat.uid !== process.getuid?.() ||
		stat.mode & 0o077 ||
		!relative(repo, path).startsWith("..")
	)
		throw new Error("private_directory_required");
	return path;
}
const summarizeLoss = (loss: AcceptedLoss) => ({
	manifest: loss.manifest,
	snapshotMatch: loss.snapshotMatch,
	accepted: loss.accepted,
	unaccepted: loss.unaccepted,
	stale: loss.stale,
	ok: loss.ok,
});
export async function execute(args: Args) {
	const directory = await privateDirectory(args.directory);
	const config = configSchema.parse(await readPrivate(args.config));
	const resolved = resolveTarget(config, args.productionTarget);
	if (config.media.bucket !== config.b2.B2_BUCKET_NAME)
		throw new Error("storage_bucket_mismatch");
	assertStorageBinding(config.media, resolved.production, args.apply);
	const [sourceText, users, admins, manifest] = await Promise.all([
		readPrivateText(args.source),
		readIdentities(args.identity, true),
		readAdminPolicy(args.adminPolicy),
		args.acceptedLoss
			? readPrivate(args.acceptedLoss).then(parseManifest)
			: null,
	]);
	const digest = sourceDigest(sourceText);
	const { source, report: counts } = projectSource(JSON.parse(sourceText));
	const identity = validateInputs(source, users, admins);
	const media = createMediaPlan(source, config.media);
	const prepared = args.offline
		? { prepared: [], quarantine: [], ready: false }
		: await prepareMedia(media, {
				directory: join(directory, "media-cache"),
				allowedHosts: config.media.allowedHosts,
			});
	const loss = evaluateAcceptedLoss(
		manifest,
		digest,
		media,
		prepared.quarantine,
	);
	const omission = args.offline
		? null
		: omitUnavailableMedia(source, media, prepared);
	const activeSource = omission?.source ?? source;
	const activePlan = omission?.plan ?? media;
	const activePrepared = omission?.prepared ?? prepared.prepared;
	const targetCounts = Object.fromEntries(
		Object.entries(activeSource).map(([name, rows]) => [name, rows.length]),
	);
	if (prepared.quarantine.length)
		await atomicPrivate(
			join(directory, "quarantine.json"),
			candidateManifest(digest, media, prepared.quarantine),
		);
	if (omission?.omissions.length) {
		await atomicPrivate(join(directory, "omissions.json"), omission.omissions);
		await atomicPrivate(join(directory, "provenance.json"), source);
	}
	const refused = applyRefusal(
		args.apply,
		args.offline,
		prepared.quarantine.length,
		identity.deferred,
		loss,
		omission?.complete ?? false,
	);
	const report = {
		version: 2,
		mode: args.apply ? "apply" : "dry-run",
		applied: false,
		refused,
		target: resolved.production ? "production" : "isolated",
		rebuild: args.rebuild,
		frozen: args.frozen,
		source: counts,
		sourceDigest: digest,
		identity,
		active: targetCounts,
		omissions: omission?.omissions.length ?? 0,
		acceptedLoss: summarizeLoss(loss),
		quarantine: loss.entries,
		media: {
			total: media.assets.length,
			ready: prepared.prepared.length,
			activeTotal: activePlan.assets.length,
			activeReady: activePrepared.length,
			quarantined: prepared.quarantine.length,
			pending: args.offline ? media.assets.length : 0,
		},
		complete: false,
	};
	await atomicPrivate(join(directory, "report.json"), report);
	if (refused !== null) return report;
	// Provisional versions exist only in memory to validate the projection before writes.
	const provisional = activePrepared.map((file) => ({
		assetId: file.assetId,
		bucket: media.bucket,
		objectKey: `${media.prefix}business-import/${file.assetId}`,
		versionId: "UNVERIFIED_PREFLIGHT",
		byteSize: file.byteSize,
		sha256: file.sha256,
		mimetype: file.mimetype,
	}));
	for (const row of projectBusiness(activeSource, {
		config: config.media,
		uploaded: provisional,
	}).rows)
		normalizeRow(row);
	const snapshot = createHash("sha256")
		.update(
			JSON.stringify({
				source,
				users,
				admins,
				acceptedLoss: loss.digest,
				omissions: omission?.omissions ?? [],
			}),
		)
		.digest("hex");
	const providerUsers = users.map((u) => ({
		id: u.id,
		accounts: u.accounts.map(({ providerId, accountId }) => ({
			providerId,
			accountId,
		})),
	}));
	const registry = providerRegistry(providerUsers, snapshot);
	const rowCheckpoint = join(directory, "rows-checkpoint.json");
	const target = new AppwriteTarget(
		config.endpoint,
		config.project,
		config.key,
		config.database,
		resolved.binding,
	);
	await assertOwnedTarget({
		target,
		checkpointPath: rowCheckpoint,
		endpoint: config.endpoint,
		project: config.project,
		database: config.database,
		snapshot,
		rebuild: args.rebuild,
		binding: resolved.binding,
	});
	const identityPath = join(directory, "identity-checkpoint.json");
	const identityTarget = new IdentityTarget(
		config.endpoint,
		config.project,
		config.key,
		resolved.identity,
	);
	const identityBinding = targetConfig(
		config.endpoint,
		config.project,
		resolved.identity,
	);
	const preflight = await preflightIdentities(
		identityTarget,
		users,
		admins,
		identityPath,
		identityBinding,
		args.rebuild,
	);
	const client = importStorage(config.b2);
	const uploadPath = join(directory, "upload-checkpoint.json");
	try {
		await assertStorageOwned({
			plan: activePlan,
			prepared: activePrepared,
			client,
			checkpointPath: uploadPath,
			rebuild: args.rebuild,
		});
		const identityCatchUp = preflight.rebase
			? await rebaseIdentities({
					target: identityTarget,
					users,
					admins,
					path: identityPath,
					binding: identityBinding,
				})
			: { remarked: 0, deleted: 0 };
		const result = await withLock(identityPath, async () =>
			importIdentities({
				users,
				admins,
				target: identityTarget,
				targetBinding: identityBinding,
				checkpoint: await load(identityPath),
				checkpointPath: identityPath,
				apply: true,
				preservePasswordless: true,
				normalizeEmails: true,
			}),
		);
		if (
			result.counts.failed ||
			result.counts.target_collision ||
			result.counts.deferred
		)
			throw new Error("identity_import_incomplete");
		await atomicPrivate(join(directory, "provider-registry.json"), registry);
		const uploaded = await uploadMedia({
			plan: activePlan,
			prepared: activePrepared,
			client,
			checkpointPath: uploadPath,
			rebuild: args.rebuild,
		});
		const projection = projectBusiness(activeSource, {
			config: config.media,
			uploaded,
		});
		await atomicPrivate(join(directory, "provenance.json"), source);
		const rows = await importRows({
			rows: projection.rows,
			tables: TABLES,
			snapshot,
			endpoint: config.endpoint,
			project: config.project,
			database: config.database,
			checkpointPath: rowCheckpoint,
			target,
			frozen: args.frozen,
			rebuild: args.rebuild,
			binding: resolved.binding,
		});
		const listed: Record<string, ProjectionRow[]> = {};
		for (const table of TABLES) listed[table] = await target.list(table);
		const identities = await identityTarget.users.list({
			queries: [Query.limit(1)],
		});
		const reconciliation = reconcile({
			source,
			active: activeSource,
			rows: projection.rows,
			target: listed,
			loss,
			identities: { source: users.length, target: identities.total },
		});
		const finalReport = {
			...report,
			applied: true,
			rows,
			media: { ...report.media, removed: uploaded.removed },
			identityCatchUp,
			isolatedRowImportComplete: rows.ok,
			reconciliation,
			complete: rows.ok && reconciliation.ok && args.frozen,
		};
		await atomicPrivate(join(directory, "report.json"), finalReport);
		return finalReport;
	} finally {
		client.destroy();
	}
}
export function reportExitCode(report: {
	mode?: string;
	applied?: boolean;
	media: { quarantined: number; pending: number };
	identity: { deferred: number };
	acceptedLoss?: { ok: boolean };
	isolatedRowImportComplete?: boolean;
	reconciliation?: { unexplained: number };
}): number {
	return (report.mode === "apply" && !report.applied) ||
		(report.media.quarantined && !report.acceptedLoss?.ok) ||
		report.media.pending ||
		report.identity.deferred ||
		report.isolatedRowImportComplete === false ||
		(report.reconciliation?.unexplained ?? 0) > 0
		? 2
		: 0;
}
// Standard output carries counts only; identifiers stay in the private report.
export function redactReport<T extends Record<string, unknown>>(
	report: T,
): Omit<T, "quarantine" | "reconciliation"> & {
	reconciliation?: ReturnType<typeof redactReconciliation>;
} {
	const { quarantine: _quarantine, reconciliation, ...rest } = report;
	return reconciliation
		? {
				...rest,
				reconciliation: redactReconciliation(reconciliation as Reconciliation),
			}
		: rest;
}
if (import.meta.main) {
	try {
		const result = await execute(parseArgs(Bun.argv.slice(2)));
		process.stdout.write(`${JSON.stringify(redactReport(result))}\n`);
		process.exitCode = reportExitCode(result);
	} catch {
		process.stderr.write("business_import_failed\n");
		process.exitCode = 1;
	}
}
