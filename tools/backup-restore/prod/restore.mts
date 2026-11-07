import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import {
	command,
	hash,
	local,
	privateDir,
	privateWrite,
	unseal,
} from "../core.mts";
import { authorize, bucketId, downloadById, pool, versions } from "./b2.mts";
import {
	archiveKey,
	args,
	backupBucket,
	elapsed,
	secrets,
	unpack,
	volumes,
} from "./shared.mts";

const project = `nfe47-prodrestore-${randomBytes(8).toString("hex")}`;
const port = 19549;
const endpoint = `http://127.0.0.1:${port}/v1`;
const countsSql = `select table_schema||'.'||table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE' order by 1`;

if (!args.run) {
	console.log(
		JSON.stringify({
			dryRun: true,
			plan: "download latest (or --name) archive with the backup key, authenticate/decrypt, restore into private Docker network on 127.0.0.1:19549, verify counts/login/ACL/media sha256, destroy",
		}),
	);
	process.exit(0);
}

const env = await secrets(args.env, [
	"B2_BACKUP_APPLICATION_KEY_ID",
	"B2_BACKUP_APPLICATION_KEY",
]);
for (const k of [
	"SMOKE_EMAIL",
	"SMOKE_PASSWORD",
	"RESTORE_PROJECT",
	"RESTORE_DATABASE",
	"RESTORE_MEDIA_KEY",
	"RESTORE_POST_ID",
])
	assert.ok(process.env[k], `env_missing_${k}`);
const key = await archiveKey(args.key);
const dir = `${local}/prod/${project}`;
const timings: Record<string, number> = {};
const checks: Record<string, unknown> = {};
const start = performance.now();
const docker = (...a: string[]) => command(["docker", ...a]);
const label = ["--label", `nfe47.project=${project}`];

function envFile(json: Buffer, override: Record<string, string> = {}) {
	const vars = new Map(
		(JSON.parse(json.toString()) as string[]).map((l) => [
			l.slice(0, l.indexOf("=")),
			l.slice(l.indexOf("=") + 1),
		]),
	);
	for (const [k, v] of Object.entries(override)) vars.set(k, v);
	for (const k of vars.keys())
		if (/^(PATH|HOSTNAME|HOME|PHP_|GOSU|PG_|LANG)/.test(k)) vars.delete(k);
	return [...vars].map(([k, v]) => `${k}=${v.replace(/\n/g, "")}`).join("\n");
}

async function waitFor(
	probe: () => Promise<boolean>,
	label: string,
	seconds = 180,
) {
	for (let i = 0; i < seconds; i++) {
		if (await probe().catch(() => false)) return;
		await Bun.sleep(1000);
	}
	assert.fail(`timeout_${label}`);
}

async function destroy() {
	const ids = (
		await docker("ps", "-aq", "--filter", `label=nfe47.project=${project}`)
	)
		.toString()
		.split("\n")
		.filter(Boolean);
	if (ids.length) await docker("rm", "-f", "-v", ...ids);
	const vols = (
		await docker(
			"volume",
			"ls",
			"-q",
			"--filter",
			`label=nfe47.project=${project}`,
		)
	)
		.toString()
		.split("\n")
		.filter(Boolean);
	if (vols.length) await docker("volume", "rm", ...vols);
	const nets = (
		await docker(
			"network",
			"ls",
			"-q",
			"--filter",
			`label=nfe47.project=${project}`,
		)
	)
		.toString()
		.split("\n")
		.filter(Boolean);
	if (nets.length) await docker("network", "rm", ...nets);
	await rm(dir, { recursive: true, force: true });
}

try {
	let t = performance.now();
	const b2 = await authorize(
		env.B2_BACKUP_APPLICATION_KEY_ID,
		env.B2_BACKUP_APPLICATION_KEY,
	);
	const bucket = await bucketId(b2, backupBucket);
	const archives = (await versions(b2, bucket, "daily/"))
		.concat(await versions(b2, bucket, "weekly/"))
		.filter((v) => v.action === "upload");
	const chosen = args.name
		? archives.find((v) => v.fileName === args.name)
		: archives.sort((a, b) => b.uploadTimestamp - a.uploadTimestamp)[0];
	assert.ok(chosen, "archive_not_found");
	const sealed = await downloadById(b2, chosen.fileId);
	timings.download = elapsed(t);
	t = performance.now();
	const { header, parts } = unpack(unseal(sealed, key));
	timings.decrypt = elapsed(t);
	checks.archive = {
		name: chosen.fileName,
		sha256: hash(sealed),
		createdAt: header.meta.createdAt,
		entries: header.entries.length,
	};

	t = performance.now();
	await privateDir(dir);
	const appwriteEnv = JSON.parse(
		parts["env-appwrite.json"].toString(),
	) as string[];
	const redisPass =
		appwriteEnv.find((l) => l.startsWith("_APP_REDIS_PASS="))?.slice(16) ?? "";
	await privateWrite(
		`${dir}/pg.env`,
		envFile(parts["env-appwrite-postgresql.json"]),
	);
	await privateWrite(
		`${dir}/appwrite.env`,
		envFile(parts["env-appwrite.json"], {
			_APP_SMTP_HOST: "",
			_APP_OPTIONS_FORCE_HTTPS: "disabled",
			_APP_OPTIONS_ROUTER_FORCE_HTTPS: "disabled",
			_APP_OPTIONS_ROUTER_PROTECTION: "disabled",
			_APP_SMTP_USERNAME: "",
			_APP_SMTP_PASSWORD: "",
		}),
	);
	await docker(
		"network",
		"create",
		"--internal",
		...label,
		`${project}-private`,
	);
	await docker("network", "create", ...label, `${project}-edge`);
	for (const v of ["postgresql", ...volumes])
		await docker("volume", "create", ...label, `${project}-${v}`);
	for (const v of volumes)
		await command(
			[
				"docker",
				"run",
				"-i",
				"--rm",
				...label,
				"-v",
				`${project}-${v}:/v`,
				"alpine",
				"tar",
				"-C",
				"/v",
				"-xf",
				"-",
			],
			parts[`volume-${v}.tar`],
		);
	await docker(
		"run",
		"-d",
		...label,
		"--name",
		`${project}-postgresql`,
		"--network",
		`${project}-private`,
		"--network-alias",
		"appwrite-postgresql",
		"--env-file",
		`${dir}/pg.env`,
		"-v",
		`${project}-postgresql:/var/lib/postgresql`,
		"appwrite/postgres:0.1.0",
	);
	await waitFor(
		async () =>
			(
				await docker(
					"exec",
					`${project}-postgresql`,
					"sh",
					"-c",
					'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h 127.0.0.1',
				)
			).length > 0,
		"postgres",
	);
	await command(
		[
			"docker",
			"exec",
			"-i",
			`${project}-postgresql`,
			"sh",
			"-c",
			'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --role="$POSTGRES_USER"',
		],
		parts["postgres.dump"],
	);
	timings.database = elapsed(t);
	const restored = (
		await docker(
			"exec",
			`${project}-postgresql`,
			"sh",
			"-c",
			`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtF "|" -c "$0"`,
			countsSql,
		)
	)
		.toString()
		.trim();
	const counts = Object.fromEntries(
		restored
			.split("\n")
			.map((l) => l.split("|"))
			.map(([n, c]) => [n, Number(c)]),
	);
	const expected = header.meta.countsAfter as Record<string, number>;
	const diff = Object.keys({ ...expected, ...counts }).filter(
		(n) => expected[n] !== counts[n],
	);
	checks.counts = {
		tables: Object.keys(counts).length,
		rows: Object.values(counts).reduce((s, n) => s + n, 0),
		mismatched: diff.length,
	};
	assert.equal(diff.length, 0, "counts_mismatch");

	t = performance.now();
	await docker(
		"run",
		"-d",
		...label,
		"--name",
		`${project}-redis`,
		"--network",
		`${project}-private`,
		"--network-alias",
		"appwrite-redis",
		"redis:7.4.7-alpine",
		...(redisPass ? ["redis-server", "--requirepass", redisPass] : []),
	);
	const mounts = volumes.flatMap((v) => [
		"-v",
		`${project}-${v}:/storage/${v}`,
	]);
	await docker(
		"create",
		...label,
		"--name",
		`${project}-appwrite`,
		"--network",
		`${project}-edge`,
		"-p",
		`127.0.0.1:${port}:80`,
		"--env-file",
		`${dir}/appwrite.env`,
		...mounts,
		"appwrite/appwrite:2.6.2",
	);
	await docker(
		"network",
		"connect",
		"--alias",
		"appwrite",
		`${project}-private`,
		`${project}-appwrite`,
	);
	await docker("start", `${project}-appwrite`);
	await waitFor(
		async () => (await fetch(`${endpoint}/health/version`)).ok,
		"appwrite",
	);
	timings.appwrite = elapsed(t);
	await rm(`${dir}/appwrite.env`, { force: true });
	await rm(`${dir}/pg.env`, { force: true });

	t = performance.now();
	const projectId = process.env.RESTORE_PROJECT as string;
	const db = process.env.RESTORE_DATABASE as string;
	const base = {
		"X-Appwrite-Project": projectId,
		"Content-Type": "application/json",
	};
	const login = await fetch(`${endpoint}/account/sessions/email`, {
		method: "POST",
		headers: base,
		body: JSON.stringify({
			email: process.env.SMOKE_EMAIL,
			password: process.env.SMOKE_PASSWORD,
		}),
	});
	assert.equal(login.status, 201, `login_${login.status}`);
	const cookie = login.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	const me = await fetch(`${endpoint}/account`, {
		headers: { ...base, Cookie: cookie },
	});
	const anonymous = await fetch(`${endpoint}/account`, { headers: base });
	const bad = await fetch(`${endpoint}/account/sessions/email`, {
		method: "POST",
		headers: base,
		body: JSON.stringify({
			email: process.env.SMOKE_EMAIL,
			password: `${process.env.SMOKE_PASSWORD}x`,
		}),
	});
	assert.equal(me.status, 200, "account_read");
	const account = (await me.json()) as { $id: string; email: string };
	assert.equal(account.email, process.env.SMOKE_EMAIL, "account_identity");
	assert.equal(anonymous.status, 401, "anonymous_account");
	assert.equal(bad.status, 401, "wrong_password");
	checks.auth = {
		login: 201,
		account: 200,
		anonymous: 401,
		wrongPassword: 401,
	};

	const rows = async (table: string, apiKey?: string) => {
		const qs = `queries[]=${encodeURIComponent(JSON.stringify({ method: "limit", values: [5000] }))}`;
		const res = await fetch(
			`${endpoint}/tablesdb/${db}/tables/${table}/rows?${qs}`,
			{ headers: apiKey ? { ...base, "X-Appwrite-Key": apiKey } : base },
		);
		return {
			status: res.status,
			body: res.ok
				? ((await res.json()) as {
						total: number;
						rows: Record<string, unknown>[];
					})
				: null,
		};
	};
	const prefix = process.env.RESTORE_POST_ID as string;
	const owned = encodeURIComponent(
		JSON.stringify({
			method: "equal",
			attribute: "userId",
			values: [account.$id],
		}),
	);
	const posts = await fetch(
		`${endpoint}/tablesdb/${db}/tables/posts/rows?queries[]=${owned}`,
		{ headers: base },
	);
	assert.equal(posts.status, 200, `posts_${posts.status}`);
	const postRow = (
		(await posts.json()) as { rows: Record<string, unknown>[] }
	).rows.find((r) => String(r.$id).startsWith(prefix));
	assert.ok(postRow, "smoke_post_missing");
	const postId = String(postRow.$id);
	const post = { status: posts.status };
	const anonymousAssets = await rows("media_assets");
	const assets = await rows(
		"media_assets",
		process.env.RESTORE_MEDIA_KEY as string,
	);
	assert.ok(assets.body, `assets_${assets.status}`);
	checks.records = {
		post: { status: post.status, published: postRow.status === "PUBLISHED" },
		mediaAssets: assets.body.total,
		anonymousMediaAssets: anonymousAssets.body
			? anonymousAssets.body.total
			: anonymousAssets.status,
	};
	assert.ok(
		!anonymousAssets.body || anonymousAssets.body.total === 0,
		"media_assets_public",
	);

	const inventory = JSON.parse(parts["b2-inventory.json"].toString()) as {
		versions: {
			fileName: string;
			action: string;
			uploadTimestamp: number;
			backupFileId: string | null;
		}[];
	};
	const latest = new Map<string, (typeof inventory.versions)[number]>();
	for (const v of inventory.versions.sort(
		(a, b) => a.uploadTimestamp - b.uploadTimestamp,
	))
		latest.set(v.fileName, v);
	const attached = assets.body.rows.filter((a) => a.state === "ATTACHED");
	const linked = attached.filter(
		(a) => a.sha256 && latest.get(String(a.objectKey))?.action === "upload",
	);
	const verified = await pool(linked, 8, async (a) => {
		const v = latest.get(String(a.objectKey));
		const data = await downloadById(b2, String(v?.backupFileId));
		return hash(data) === a.sha256;
	});
	const ownPostAssets = attached.filter(
		(a) => a.postId === postId && a.ownerId === postRow.userId,
	).length;
	checks.media = {
		attached: attached.length,
		withBackupCopy: linked.length,
		sha256Match: verified.filter(Boolean).length,
		smokePostAssets: ownPostAssets,
	};
	assert.equal(verified.filter(Boolean).length, linked.length, "media_sha256");
	assert.equal(
		linked.length,
		attached.filter((a) => a.sha256).length,
		"media_missing_backup",
	);
	timings.verify = elapsed(t);
} catch (error) {
	for (const c of ["appwrite", "postgresql", "redis"]) {
		const logs = await Bun.spawn(
			["docker", "logs", "--tail", "120", `${project}-${c}`],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const text =
			(await new Response(logs.stdout).text()) +
			(await new Response(logs.stderr).text());
		await privateDir(`${local}/prod`);
		await privateWrite(`${local}/prod/${project}.${c}.log`, text);
	}
	throw error;
} finally {
	const t = performance.now();
	await destroy();
	timings.destroy = elapsed(t);
	timings.total = elapsed(start);
	const report = { project, timingsMs: timings, checks };
	await privateDir(`${local}/prod`);
	await privateWrite(
		`${local}/prod/${project}.restore.json`,
		JSON.stringify(report, null, 2),
	);
	console.log(JSON.stringify(report, null, 2));
}
