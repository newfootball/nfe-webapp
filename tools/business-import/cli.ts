import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { Query } from "node-appwrite";
import { z } from "zod";
import {
	atomicPrivate,
	digest,
	load,
	withLock,
} from "../identity-import/checkpoint";
import {
	plan as identityPlan,
	runImport as importIdentities,
} from "../identity-import/importer";
import { providerRegistry } from "../identity-import/oauth-registry";
import {
	readAdminPolicy,
	readSource as readIdentities,
	readPrivate,
	type SourceUser,
} from "../identity-import/source";
import {
	AppwriteTarget as IdentityTarget,
	targetConfig,
} from "../identity-import/target";
import { BUSINESS_TABLES, normalizeRow } from "./contract";
import { deriveDevelopmentImport } from "./development";
import { prepareMedia } from "./download";
import { createMediaPlan } from "./media-plan";
import { projectBusiness } from "./projection";
import { assertOwnedTarget, runImport as importRows } from "./runner";
import { type BusinessSource, readSource } from "./source";
import { AppwriteTarget, targetBinding } from "./target";
import { assertStorageOwned, importStorage, uploadMedia } from "./upload";

const configSchema = z.strictObject({
	endpoint: z.string(),
	project: z.string(),
	database: z.string(),
	key: z.string().min(1),
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
const TABLES = BUSINESS_TABLES;
type Args = {
	source: string;
	identity: string;
	adminPolicy: string;
	config: string;
	directory: string;
	apply: boolean;
	offline: boolean;
	rebuild: boolean;
	frozen: boolean;
	allowMissingMediaInDevelopment: boolean;
};
export function parseArgs(args: string[]): Args {
	const fields: Record<string, string> = {},
		flags = new Set<string>();
	const valueArgs = new Set([
			"--source",
			"--identity",
			"--admin-policy",
			"--config",
			"--directory",
		]),
		switches = new Set([
			"--source-authorized",
			"--dry-run",
			"--apply",
			"--offline",
			"--freeze-confirmed",
			"--rebuild",
			"--allow-missing-media-in-development",
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
		[...valueArgs].some((k) => !fields[k]) ||
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
		apply: flags.has("--apply"),
		offline: flags.has("--offline"),
		rebuild: flags.has("--rebuild"),
		frozen: flags.has("--freeze-confirmed"),
		allowMissingMediaInDevelopment: flags.has(
			"--allow-missing-media-in-development",
		),
	};
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
export function mayApply(
	apply: boolean,
	offline: boolean,
	quarantined: number,
	deferred: number,
	allowMissing = false,
	derivedComplete = false,
) {
	return (
		apply &&
		!offline &&
		(quarantined === 0 || (allowMissing && derivedComplete)) &&
		deferred === 0
	);
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
export async function preflightIdentities(
	target: IdentityTarget,
	users: SourceUser[],
	admins: string[],
	path: string,
	binding: string,
) {
	const cp = await load(path);
	const expectedBinding = digest(cp.key, {
		users,
		admins,
		target: binding,
		preservePasswordless: true,
		normalizeEmails: true,
	});
	if (cp.binding && cp.binding !== expectedBinding)
		throw new Error("identity_checkpoint_binding_mismatch");
	let offset = 0;
	for (;;) {
		const page = await target.users.list<{ nfeIdentityImport?: string }>({
			queries: [Query.limit(100), Query.offset(offset)],
		});
		for (const user of page.users) {
			const source = users.find((u) => u.id === user.$id),
				ref = digest(cp.key, user.$id);
			const marker = digest(cp.key, { binding: expectedBinding, id: user.$id });
			if (
				!source ||
				!["owned", "done"].includes(cp.entries[ref] ?? "") ||
				user.prefs.nfeIdentityImport !== marker ||
				user.email !== source.email?.toLowerCase()
			)
				throw new Error("foreign_target_identity");
		}
		offset += page.users.length;
		if (!page.users.length || offset >= page.total) break;
	}
	// The importer performs the same password, role and checkpoint checks that
	// apply will enforce, without creating users or persisting this checkpoint.
	const report = await importIdentities({
		users,
		admins,
		target,
		targetBinding: binding,
		checkpoint: cp,
		apply: false,
		preservePasswordless: true,
		normalizeEmails: true,
	});
	if (
		report.counts.failed ||
		report.counts.target_collision ||
		report.counts.deferred ||
		(report.counts.eligible ?? 0) + (report.counts.already_owned ?? 0) !==
			users.length
	)
		throw new Error("identity_preflight_incomplete");
}
export async function execute(args: Args) {
	if (args.rebuild) throw new Error("rebuild_pending_full_freeze_proof");
	const directory = await privateDirectory(args.directory);
	const config = configSchema.parse(await readPrivate(args.config));
	targetBinding(config.endpoint, config.project, config.database);
	targetConfig(config.endpoint, config.project, {
		isolatedBusinessImport: true,
	});
	if (config.media.bucket !== config.b2.B2_BUCKET_NAME)
		throw new Error("storage_bucket_mismatch");
	const [{ source, report: counts }, users, admins] = await Promise.all([
		readSource(args.source, true),
		readIdentities(args.identity, true),
		readAdminPolicy(args.adminPolicy),
	]);
	const identity = validateInputs(source, users, admins);
	const media = createMediaPlan(source, config.media);
	const prepared = args.offline
		? { prepared: [], quarantine: [], ready: false }
		: await prepareMedia(media, {
				directory: join(directory, "media-cache"),
				allowedHosts: config.media.allowedHosts,
			});
	const development =
		!args.offline && args.allowMissingMediaInDevelopment
			? deriveDevelopmentImport(source, media, prepared)
			: null;
	const activeSource = development?.source ?? source;
	const activePlan = development?.plan ?? media;
	const activePrepared = development?.prepared ?? prepared.prepared;
	const acceptedMissing = Boolean(
		development?.complete && prepared.quarantine.length,
	);
	const targetCounts = Object.fromEntries(
		Object.entries(activeSource).map(([name, rows]) => [name, rows.length]),
	);
	if (development) {
		await atomicPrivate(
			join(directory, "omissions.json"),
			development.omissions,
		);
		await atomicPrivate(join(directory, "provenance.json"), source);
	}
	const report = {
		version: 1,
		mode: args.apply ? "apply" : "dry-run",
		source: counts,
		identity,
		target: targetCounts,
		omissions: development?.omissions.length ?? 0,
		acceptedMissing,
		devImportComplete: false,
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
	if (
		!mayApply(
			args.apply,
			args.offline,
			prepared.quarantine.length,
			identity.deferred,
			args.allowMissingMediaInDevelopment,
			development?.complete ?? false,
		)
	)
		return report;
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
				allowMissingMediaInDevelopment: args.allowMissingMediaInDevelopment,
				omissions: development?.omissions ?? [],
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
	);
	await assertOwnedTarget({
		target,
		checkpointPath: rowCheckpoint,
		endpoint: config.endpoint,
		project: config.project,
		database: config.database,
		snapshot,
	});
	const identityPath = join(directory, "identity-checkpoint.json");
	const identityTarget = new IdentityTarget(
		config.endpoint,
		config.project,
		config.key,
		{ isolatedBusinessImport: true },
	);
	const identityBinding = targetConfig(config.endpoint, config.project, {
		isolatedBusinessImport: true,
	});
	await preflightIdentities(
		identityTarget,
		users,
		admins,
		identityPath,
		identityBinding,
	);
	const client = importStorage(config.b2);
	const uploadPath = join(directory, "upload-checkpoint.json");
	try {
		await assertStorageOwned({
			plan: activePlan,
			prepared: activePrepared,
			client,
			checkpointPath: uploadPath,
		});
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
		});
		const finalReport = {
			...report,
			rows,
			isolatedRowImportComplete: rows.ok,
			devImportComplete: args.allowMissingMediaInDevelopment && rows.ok,
			complete: false,
		};
		await atomicPrivate(join(directory, "report.json"), finalReport);
		return finalReport;
	} finally {
		client.destroy();
	}
}
export function reportExitCode(report: {
	media: { quarantined: number; pending: number };
	identity: { deferred: number };
	acceptedMissing?: boolean;
	isolatedRowImportComplete?: boolean;
}): number {
	return (report.media.quarantined && !report.acceptedMissing) ||
		report.media.pending ||
		report.identity.deferred ||
		report.isolatedRowImportComplete === false
		? 2
		: 0;
}
if (import.meta.main) {
	try {
		const result = await execute(parseArgs(Bun.argv.slice(2)));
		process.stdout.write(`${JSON.stringify(result)}\n`);
		process.exitCode = reportExitCode(result);
	} catch {
		process.stderr.write("business_import_failed\n");
		process.exitCode = 1;
	}
}
