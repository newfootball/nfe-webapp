import { chmod, mkdir } from "node:fs/promises";
import { endpoint, state } from "./profile-local";
import {
	profileDatabase,
	provisionProfiles,
	verifyProfileSchemaRerun,
} from "./profile-provision";

const credentials = await provisionProfiles();
const env = {
	...process.env,
	START_APP_ORIGIN: "http://127.0.0.1:3513",
	START_APPWRITE_ENDPOINT: endpoint,
	START_APPWRITE_PROJECT: credentials.project,
	START_APPWRITE_SESSION_KEY: credentials.sessionKey,
	START_APPWRITE_PROFILE_WRITER_KEY: credentials.writerKey,
	START_APPWRITE_DATABASE: profileDatabase,
	START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
	PORT: "3513",
	NODE_ENV: "production",
};
const log = `${state}/server.log`;
await Bun.write(log, "");
await chmod(log, 0o600);
const server = Bun.spawn(["bun", "server.ts"], {
	cwd: `${import.meta.dir}/..`,
	env,
	stdout: Bun.file(log),
	stderr: Bun.file(log),
});
let exit = 1;
try {
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			if ((await fetch(`${env.START_APP_ORIGIN}/fr`)).ok) break;
		} catch {}
		if (server.exitCode !== null)
			throw new Error("Synthetic server failed to start");
		await Bun.sleep(250);
	}
	const test = Bun.spawn(
		[
			"bun",
			"x",
			"--no-install",
			"playwright",
			"test",
			"--config",
			"playwright.profile.config.ts",
		],
		{ cwd: `${import.meta.dir}/..`, env, stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, code] = await Promise.all([
		new Response(test.stdout).text(),
		new Response(test.stderr).text(),
		test.exited,
	]);
	await Bun.write(`${state}/test.log`, out + err);
	await chmod(`${state}/test.log`, 0o600);
	exit = code;
	if (code === 0) await verifyProfileSchemaRerun(credentials);
	// Redact fixture/key/session values before publishing diagnostics.
	let diagnostic = out + err;
	const fixture = Bun.file(`${state}/fixture.json`);
	const protectedValues: string[] = [
		credentials.proofKey,
		credentials.sessionKey,
		credentials.writerKey,
	];
	if (await fixture.exists())
		protectedValues.push(
			...Object.values(await fixture.json()).filter(
				(value): value is string =>
					typeof value === "string" && value.length > 20,
			),
		);
	for (const value of protectedValues)
		diagnostic = diagnostic.replaceAll(value, "[REDACTED]");
	process.stdout.write(diagnostic);
	const files: string[] = [];
	for await (const path of new Bun.Glob("**/*").scan({
		cwd: `${import.meta.dir}/../dist/client`,
		onlyFiles: true,
	}))
		files.push(`${import.meta.dir}/../dist/client/${path}`);
	files.push(log);
	for (const path of files) {
		const content = await Bun.file(path).text();
		if (protectedValues.some((value) => content.includes(value)))
			throw new Error("Sensitive-output scan failed");
	}
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/profile-synthetic.json`,
		JSON.stringify(
			{
				at: new Date().toISOString(),
				appwrite: "2.6.2",
				project: "nfe-profile-53",
				source: "synthetic only",
				testExit: code,
				sensitiveScan: { files: files.length, matches: 0 },
				database: profileDatabase,
				buildSha256: new Bun.CryptoHasher("sha256")
					.update(
						await Bun.file(
							`${import.meta.dir}/../dist/server/server.js`,
						).arrayBuffer(),
					)
					.digest("hex"),
				checks: [
					"signup/onboarding/profile/edit/reload: USER PLAYER COACH RECRUITER CLUB",
					"fresh concurrent initialization: 8 RPCs",
					"atomic initialization/publication/update and unique collision rollback",
					"A/B/admin/anonymous ACL and no direct client writes",
					"strict malformed/foreign/role/prefs/email inputs and exact Origin",
					"private/public SSR redaction and concurrent identity isolation",
					"FR/EN aliases, weighted header, cookie, account preference and explicit URL priority",
					"disabled/revoked identity and least-scope runtime keys",
					"v2 schema replay preserves all rows, dates, nulls and ACLs",
				],
				productionGates: "not exercised",
			},
			null,
			"\t",
		) + "\n",
	);
} finally {
	server.kill();
	await server.exited;
}
process.exit(exit);
