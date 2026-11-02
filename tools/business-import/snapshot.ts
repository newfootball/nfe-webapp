import { createHash, randomBytes } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { projectSource } from "./source";

export const sourceTables = [
	"User",
	"Account",
	"Post",
	"Media",
	"Follow",
	"Like",
	"Favorite",
	"Comment",
	"Message",
	"Notification",
	"PostSignal",
] as const;

// PostgreSQL, rather than the application ORM, creates the coherent snapshot.
// Only the restored, network-isolated copy is queried for projections.
export function businessExportSql() {
	const parts = sourceTables.map((table) => {
		let expression = "to_jsonb(t)";
		if (table === "User")
			expression =
				"to_jsonb(t) - ARRAY['password','resetToken','resetTokenExpiry']";
		if (table === "Account")
			expression = `jsonb_build_object('id',t.id,'userId',t."userId",'providerId',t."providerId",'accountId',t."accountId",'createdAt',t."createdAt",'updatedAt',t."updatedAt")`;
		return `'${table}',(SELECT coalesce(jsonb_agg(${expression} ORDER BY t.id),'[]'::jsonb) FROM "${table}" t)`;
	});
	return `BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; SELECT jsonb_build_object('version',1,'tables',jsonb_build_object(${parts.join(",")})); COMMIT;`;
}

const identitySql = `BEGIN READ ONLY;
SELECT jsonb_build_object('version',1,'users',coalesce(jsonb_agg(jsonb_build_object(
'id',u.id,'email',u.email,'emailVerified',u."emailVerified",'role',u.role,
'legacyPassword',u.password,'accounts',(SELECT coalesce(jsonb_agg(jsonb_build_object(
'providerId',a."providerId",'accountId',a."accountId",'password',a.password)),'[]'::jsonb)
FROM "Account" a WHERE a."userId"=u.id)) ORDER BY u.id),'[]'::jsonb)) FROM "User" u; COMMIT;`;

async function command(args: string[], input?: string | Bun.BunFile) {
	const process = Bun.spawn(args, {
		stdin:
			input === undefined
				? "ignore"
				: input instanceof Blob
					? input
					: new Blob([input]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, , code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (code !== 0) throw new Error("snapshot_command_failed");
	return output;
}

export async function snapshotLocal(options: {
	container: string;
	output: string;
	authorized: boolean;
}) {
	if (!options.authorized) throw new Error("source_authorization_required");
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(options.container))
		throw new Error("invalid_source_container");
	const output = resolve(options.output);
	// Exclusive creation prevents overwriting a previous snapshot or a symlink.
	await mkdir(output, { mode: 0o700 });
	const inspected = JSON.parse(
		await command(["docker", "inspect", options.container]),
	);
	const source = inspected[0];
	if (
		!source?.State?.Running ||
		!/^postgres:17(?:[.-]|$)/.test(source.Config.Image)
	)
		throw new Error("unsupported_source_container");
	const env = Object.fromEntries(
		(source.Config.Env as string[]).map((entry) => {
			const at = entry.indexOf("=");
			return [entry.slice(0, at), entry.slice(at + 1)];
		}),
	);
	const user = env.POSTGRES_USER || "postgres";
	const database = env.POSTGRES_DB || user;
	const dump = `${output}/source.dump`;
	const fd = openSync(dump, "wx", 0o600);
	try {
		const process = Bun.spawn(
			[
				"docker",
				"exec",
				"--env",
				"PGOPTIONS=-c default_transaction_read_only=on",
				options.container,
				"pg_dump",
				"--format=custom",
				"--no-owner",
				"--no-acl",
				"--username",
				user,
				"--dbname",
				database,
			],
			{ stdin: "ignore", stdout: fd, stderr: "pipe" },
		);
		const [, code] = await Promise.all([
			new Response(process.stderr).text(),
			process.exited,
		]);
		if (code !== 0) throw new Error("source_dump_failed");
	} finally {
		closeSync(fd);
	}
	const copy = `nfe-import-63-copy-${randomBytes(8).toString("hex")}`;
	let created = false;
	try {
		await command([
			"docker",
			"run",
			"--detach",
			"--name",
			copy,
			"--label",
			"nfe.migration.issue=63",
			"--network",
			"none",
			"--tmpfs",
			"/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
			"--env",
			"POSTGRES_HOST_AUTH_METHOD=trust",
			source.Image,
		]);
		created = true;
		let ready = false;
		for (let attempt = 0; attempt < 80; attempt++) {
			// initdb's temporary server exposes only a Unix socket. TCP readiness
			// establishes that initialization and its restart have both completed.
			try {
				await command([
					"docker",
					"exec",
					copy,
					"pg_isready",
					"-h",
					"127.0.0.1",
					"-U",
					"postgres",
				]);
				ready = true;
				break;
			} catch {
				await Bun.sleep(250);
			}
		}
		if (!ready) throw new Error("copy_readiness_failed");
		await command(
			[
				"docker",
				"exec",
				"-i",
				copy,
				"pg_restore",
				"--exit-on-error",
				"--no-owner",
				"--no-acl",
				"--username",
				"postgres",
				"--dbname",
				"postgres",
			],
			Bun.file(dump),
		);
		const query = (sql: string) =>
			command(
				[
					"docker",
					"exec",
					"-i",
					copy,
					"psql",
					"-U",
					"postgres",
					"-d",
					"postgres",
					"-qAt",
					"-v",
					"ON_ERROR_STOP=1",
				],
				sql,
			);
		const business = JSON.parse(await query(businessExportSql()));
		const { report } = projectSource(business);
		const identity = JSON.parse(await query(identitySql));
		for (const [name, value] of [
			["business-source.json", business],
			["identity-source.json", identity],
		] as const)
			await writeFile(`${output}/${name}`, `${JSON.stringify(value)}\n`, {
				flag: "wx",
				mode: 0o600,
			});
		const metadata = {
			version: 1,
			createdAt: new Date().toISOString(),
			source: options.container,
			sourceReadOnly: true,
			image: source.Image,
			copyNetwork: "none",
			counts: report,
			dumpSha256: createHash("sha256")
				.update(Buffer.from(await Bun.file(dump).arrayBuffer()))
				.digest("hex"),
		};
		await writeFile(
			`${output}/snapshot.json`,
			`${JSON.stringify(metadata)}\n`,
			{ flag: "wx", mode: 0o600 },
		);
		return metadata;
	} finally {
		if (created) await command(["docker", "rm", "--force", "--volumes", copy]);
	}
}

if (import.meta.main) {
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			strict: true,
			options: {
				container: { type: "string" },
				output: { type: "string" },
				"source-authorized": { type: "boolean" },
			},
		});
		if (!values.container || !values.output)
			throw new Error("snapshot_arguments_required");
		const result = await snapshotLocal({
			container: values.container,
			output: values.output,
			authorized: !!values["source-authorized"],
		});
		console.log(
			JSON.stringify({ status: "snapshot_verified", counts: result.counts }),
		);
	} catch {
		console.error("Snapshot stopped; private source details suppressed.");
		process.exitCode = 1;
	}
}
