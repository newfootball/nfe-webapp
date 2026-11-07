import assert from "node:assert/strict";
import { hash, local, privateDir, privateWrite, seal } from "../core.mts";
import {
	authorize,
	bucketId,
	copy,
	pool,
	upload,
	type Version,
	versions,
} from "./b2.mts";
import {
	archiveKey,
	args,
	backupBucket,
	elapsed,
	pack,
	remote,
	secrets,
	service,
	sourceBucket,
	volumes,
} from "./shared.mts";

const sha1 = (v: Version) => v.contentSha1.replace(/^unverified:/, "");
const sameContent = (a: Version, b: Version) =>
	a.contentLength === b.contentLength &&
	(sha1(a) === "none" || sha1(b) === "none" || sha1(a) === sha1(b));
const container = (name: string) => `${name}-${service}`;
const pg = container("appwrite-postgresql");
const countsSql = `select table_schema||'.'||table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE' order by 1`;

export const psql = (sql: string) =>
	`docker exec ${pg} sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -AtF "|" -c "$0"' "${sql.replace(/"/g, '\\"')}"`;

async function counts() {
	const out = (await remote(psql(countsSql))).toString().trim();
	return Object.fromEntries(
		out
			.split("\n")
			.map((l) => l.split("|"))
			.map(([t, c]) => [t, Number(c)]),
	);
}

const plan = {
	host: "nfe-production",
	service,
	database:
		"pg_dump -Fc (online, single snapshot) + exact row counts before/after",
	volumes,
	redis: "RDB snapshot (forensic only, not replayed)",
	service_dir: "compose, .env (_APP_OPENSSL_KEY_V1), clickhouse config",
	media: `every ${sourceBucket} version copied server-side to ${backupBucket}/media/<fileId>`,
	excluded: [
		"clickhouse usage statistics (rebuildable, owner sign-off pending)",
	],
	destination: `${backupBucket}/${args.tier}/<stamp>.nfe47 (AES-256-GCM, Object Lock governance)`,
};

if (!args.run) {
	console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
	process.exit(0);
}
assert.ok(["daily", "weekly"].includes(args.tier ?? ""), "tier_invalid");
const env = await secrets(args.env, [
	"B2_APPLICATION_KEY_ID",
	"B2_APPLICATION_KEY",
	"B2_BACKUP_APPLICATION_KEY_ID",
	"B2_BACKUP_APPLICATION_KEY",
]);
const key = await archiveKey(args.key);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const timings: Record<string, number> = {};
const start = performance.now();

let t = performance.now();
const before = await counts();
const dump = await remote(
	`docker exec ${pg} sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`,
);
const after = await counts();
const pgVersion = (await remote(psql("show server_version"))).toString().trim();
timings.database = elapsed(t);

t = performance.now();
const parts: Record<string, Uint8Array> = { "postgres.dump": dump };
parts["redis.rdb"] = await remote(
	`docker exec ${container("appwrite-redis")} sh -c 'redis-cli --rdb /tmp/nfe47.rdb >/dev/null && cat /tmp/nfe47.rdb && rm -f /tmp/nfe47.rdb'`,
);
for (const v of volumes)
	parts[`volume-${v}.tar`] = await remote(
		`docker run --rm -v ${service}_appwrite-${v}:/v:ro alpine tar -C /v -cf - .`,
	);
parts["service.tar"] = await remote(
	`tar -C /data/coolify/services/${service} -cf - .`,
);
for (const c of ["appwrite", "appwrite-postgresql", "appwrite-clickhouse"])
	parts[`env-${c}.json`] = await remote(
		`docker inspect ${container(c)} --format '{{json .Config.Env}}'`,
	);
timings.files = elapsed(t);

t = performance.now();
const admin = await authorize(
	env.B2_APPLICATION_KEY_ID,
	env.B2_APPLICATION_KEY,
);
const source = await bucketId(admin, sourceBucket);
const target = await bucketId(admin, backupBucket);
const sourceVersions = await versions(admin, source);
const existing = new Map(
	(await versions(admin, target, "media/")).map((v) => [v.fileName, v]),
);
const pending = sourceVersions.filter(
	(v) => v.action === "upload" && !existing.has(`media/${v.fileId}`),
);
await pool(pending, 8, async (v) =>
	existing.set(
		`media/${v.fileId}`,
		await copy(admin, v.fileId, target, `media/${v.fileId}`),
	),
);
const inventory = sourceVersions.map((v) => {
	const backup =
		v.action === "upload" ? existing.get(`media/${v.fileId}`) : undefined;
	assert.ok(
		v.action !== "upload" || (backup && sameContent(v, backup)),
		"media_copy_mismatch",
	);
	return {
		...v,
		backupFileName: backup?.fileName ?? null,
		backupFileId: backup?.fileId ?? null,
	};
});
parts["b2-inventory.json"] = Buffer.from(
	JSON.stringify({ bucket: sourceBucket, versions: inventory }),
);
timings.media = elapsed(t);

const meta = {
	createdAt: new Date().toISOString(),
	service,
	postgres: pgVersion,
	appwrite: "2.6.2",
	countsBefore: before,
	countsAfter: after,
	stable: JSON.stringify(before) === JSON.stringify(after),
	media: {
		versions: inventory.length,
		copiedNow: pending.length,
		bytes: inventory.reduce((s, v) => s + v.contentLength, 0),
	},
	excluded: plan.excluded,
};
t = performance.now();
const sealed = seal(pack(meta, parts), key);
const backupKey = await authorize(
	env.B2_BACKUP_APPLICATION_KEY_ID,
	env.B2_BACKUP_APPLICATION_KEY,
);
const name = `${args.tier}/${stamp}.nfe47`;
const uploaded = await upload(
	backupKey,
	await bucketId(backupKey, backupBucket),
	name,
	sealed,
);
timings.upload = elapsed(t);
timings.total = elapsed(start);

const report = {
	name,
	fileId: uploaded.fileId,
	archiveBytes: sealed.byteLength,
	archiveSha256: hash(sealed),
	entries: Object.fromEntries(
		Object.entries(parts).map(([n, d]) => [n, d.byteLength]),
	),
	tables: Object.keys(before).length,
	rows: Object.values(before).reduce((s, n) => s + n, 0),
	stable: meta.stable,
	postgres: pgVersion,
	media: meta.media,
	excluded: meta.excluded,
	timingsMs: timings,
};
await privateDir(`${local}/prod`);
await privateWrite(
	`${local}/prod/${stamp}.backup.json`,
	JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
