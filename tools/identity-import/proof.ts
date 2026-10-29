import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { Account, Client } from "node-appwrite";
import { bootstrap } from "./bootstrap";
import { atomicPrivate, fresh } from "./checkpoint";
import { runImport } from "./importer";
import { endpoint, state } from "./local";
import type { SourceUser } from "./source";
import { AppwriteTarget, targetConfig } from "./target";

let stage = "bootstrap";
try {
	const credentials = await bootstrap();
	const target = new AppwriteTarget(
		endpoint,
		credentials.project,
		credentials.key,
	);
	const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
	const hash = await bcrypt.hash(password, 10);
	const namespace = crypto.randomUUID().slice(0, 8);
	const users: SourceUser[] = [true, false].map((verified, index) => ({
		id: `identity-${namespace}-${index}`,
		email: `identity-${namespace}-${index}@example.test`,
		emailVerified: verified,
		role: index === 0 ? "ADMIN" : "USER",
		legacyPassword: null,
		accounts: [
			{
				providerId: "credential",
				accountId: `identity-${namespace}-${index}`,
				password: hash,
			},
		],
	}));
	const cpPath = `${state}/checkpoint-${namespace}.json`;
	const binding = targetConfig(endpoint, credentials.project);
	const args = {
		users,
		admins: [users[0]!.id],
		target,
		targetBinding: binding,
		checkpoint: fresh(),
		checkpointPath: cpPath,
		apply: true,
	};
	stage = "dry-run";
	const dry = await runImport({ ...args, apply: false });
	assert.equal(dry.counts.eligible, 2);
	stage = "interruption";
	const interrupted = await runImport({
		...args,
		afterOwned: async () => {
			throw new Error("synthetic interruption");
		},
	});
	assert.equal(interrupted.counts.failed, 2);
	await target.users.updateLabels({
		userId: users[0]!.id,
		labels: ["audience"],
	});
	// Reload from disk, reproducing a fresh process and recovering the pre-finalization state.
	stage = "restart-cli";
	const sourcePath = `${state}/source-${namespace}.json`;
	const policyPath = `${state}/admins-${namespace}.json`;
	await atomicPrivate(sourcePath, { version: 1, users });
	await atomicPrivate(policyPath, args.admins);
	async function cli() {
		const p = Bun.spawn(
			[
				"bun",
				"run",
				`${import.meta.dir}/cli.ts`,
				"--source",
				sourcePath,
				"--source-authorized",
				"--apply",
				"--checkpoint",
				cpPath,
				"--report",
				`${state}/report-${namespace}.json`,
				"--admin-policy",
				policyPath,
			],
			{
				env: {
					...process.env,
					NFE_IDENTITY_ENDPOINT: endpoint,
					NFE_IDENTITY_PROJECT: credentials.project,
					NFE_IDENTITY_KEY: credentials.key,
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [output, , code] = await Promise.all([
			new Response(p.stdout).text(),
			new Response(p.stderr).text(),
			p.exited,
		]);
		assert.equal(code, 0);
		return JSON.parse(output) as { counts: Record<string, number> };
	}
	const restart = await cli();
	assert.equal(restart.counts.imported, 2);
	stage = "replay-cli";
	const replay = await cli();
	assert.equal(replay.counts.unchanged, 2);
	stage = "login";
	for (const user of users) {
		const imported = await target.get(user.id);
		assert.ok(imported);
		assert.equal(imported.email, user.email);
		assert.equal(imported.verified, user.emailVerified);
		assert.equal(imported.password, hash);
		assert.deepEqual(
			imported.labels,
			user.role === "ADMIN" ? ["audience", "admin"] : [],
		);
		const account = new Account(
			new Client().setEndpoint(endpoint).setProject(credentials.project),
		);
		const session = await account.createEmailPasswordSession({
			email: user.email!,
			password,
		});
		assert.equal(session.userId, user.id);
		await assert.rejects(
			() =>
				account.createEmailPasswordSession({
					email: user.email!,
					password: "wrong-synthetic-password",
				}),
			(e) => (e as { code: number }).code === 401,
		);
	}
	// Existing foreign user never adopted, relabelled, verified or overwritten.
	const foreign = {
		...users[1]!,
		id: `foreign-${namespace}`,
		email: `foreign-${namespace}@example.test`,
		accounts: [
			{
				providerId: "credential",
				accountId: `foreign-${namespace}`,
				password: hash,
			},
		],
	};
	stage = "foreign-collision";
	await target.create(foreign, hash);
	const collision = await runImport({
		...args,
		users: [foreign],
		admins: [],
		checkpoint: fresh(),
		checkpointPath: `${state}/foreign-${namespace}.json`,
	});
	assert.equal(collision.counts.target_collision, 1);
	const mixed = {
		...users[1]!,
		id: `mixed-${namespace}`,
		email: `Mixed-${namespace}@example.test`,
		accounts: [
			{
				providerId: "credential",
				accountId: `mixed-${namespace}`,
				password: hash,
			},
		],
	};
	stage = "case-preservation-exception";
	const mixedReport = await runImport({
		...args,
		users: [mixed],
		admins: [],
		checkpoint: fresh(),
		checkpointPath: `${state}/mixed-${namespace}.json`,
	});
	assert.equal(mixedReport.counts.deferred, 1);
	assert.equal(await target.get(mixed.id), null);
	const report = {
		timestamp: new Date().toISOString(),
		appwrite: credentials.version,
		bun: Bun.version,
		source: "synthetic-only",
		checks: {
			dryRun: true,
			bcryptLogin: true,
			wrongPasswordRejected: true,
			exactIdentityAndVerification: true,
			privilegedAdmin: true,
			unrelatedLabelsPreserved: true,
			idempotentReplay: true,
			checkpointRestart: true,
			foreignUserCollision: true,
			mixedCaseEmailDeferred: true,
		},
		production: "not_run; blocked by #47/#49",
	};
	await atomicPrivate(`${import.meta.dir}/evidence/synthetic.json`, report);
	console.log(JSON.stringify(report));
} catch (error) {
	console.error(
		JSON.stringify({
			status: "failed",
			stage,
			code: (error as { code?: string | number }).code,
			name: (error as Error).name,
		}),
	);
	process.exitCode = 1;
}
