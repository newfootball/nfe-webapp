import { chmod, mkdir } from "node:fs/promises";
import { Client, Users } from "node-appwrite";
import { createClient } from "redis";
import { bootstrapRecovery } from "./recovery-bootstrap";
import { endpoint, state } from "./recovery-local";

const credentials = await bootstrapRecovery();
const fixtures = new Users(
	new Client()
		.setEndpoint(endpoint)
		.setProject(credentials.project)
		.setKey(credentials.proofKey),
);
for (const user of (await fixtures.list()).users)
	await fixtures.delete({ userId: user.$id });
await fetch("http://127.0.0.1:18052/api/v1/messages", { method: "DELETE" });
const isolatedRedis = createClient({ url: "redis://127.0.0.1:19652" });
await isolatedRedis.connect();
try {
	const keys = await isolatedRedis.keys("nfe:auth52:*");
	if (keys.length) await isolatedRedis.del(keys);
} finally {
	isolatedRedis.destroy();
}
const registryPath = `${state}/registry.json`;
await Bun.write(
	registryPath,
	JSON.stringify({
		version: 1,
		sourceDigest: "0".repeat(64),
		coverageComplete: false,
		identities: [
			{
				issuer: "https://accounts.google.com",
				provider: "google",
				subject: "synthetic-subject",
				userId: "synthetic-imported",
			},
		],
	}),
);
await chmod(registryPath, 0o600);
const env = {
	...process.env,
	START_APP_ORIGIN: "http://127.0.0.1:3522",
	START_APPWRITE_ENDPOINT: endpoint,
	START_APPWRITE_PROJECT: credentials.project,
	START_APPWRITE_SESSION_KEY: credentials.sessionKey,
	START_OAUTH_BROKER_KEY: credentials.brokerKey,
	START_OAUTH_REDIS_URL: "redis://127.0.0.1:19652",
	START_OAUTH_REGISTRY_PATH: registryPath,
	START_GOOGLE_ENABLED: "true",
	START_GOOGLE_CLIENT_ID: "synthetic-never-exchanged",
	START_GOOGLE_CLIENT_SECRET: "synthetic-never-exchanged-secret",
	START_RECOVERY_INVALIDATION_CONFIRMED: "2.6.2",
	START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
	PORT: "3522",
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
const replica = Bun.spawn(["bun", "server.ts"], {
	cwd: `${import.meta.dir}/..`,
	env: { ...env, PORT: "3523" },
	stdout: Bun.file(`${state}/replica.log`),
	stderr: Bun.file(`${state}/replica.log`),
});
try {
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			if (
				(await fetch(`${env.START_APP_ORIGIN}/fr`)).ok &&
				(await fetch("http://127.0.0.1:3523/fr")).ok
			)
				break;
		} catch {}
		if (server.exitCode !== null)
			throw new Error("Synthetic built server failed");
		await Bun.sleep(250);
	}
	const run = Bun.spawn(
		[
			"bun",
			"x",
			"--no-install",
			"playwright",
			"test",
			"--config",
			"playwright.recovery.config.ts",
		],
		{ cwd: `${import.meta.dir}/..`, env, stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, code] = await Promise.all([
		new Response(run.stdout).text(),
		new Response(run.stderr).text(),
		run.exited,
	]);
	// Raw test diagnostics can contain synthetic challenges. They stay in protected local storage.
	await Bun.write(`${state}/test.log`, out + err);
	await chmod(`${state}/test.log`, 0o600);
	const fixture = await Bun.file(`${state}/fixture.json`)
		.json()
		.catch(() => ({}));
	const protectedValues = [
		...Object.values(credentials),
		...Object.values(fixture),
	].filter((v): v is string => typeof v === "string" && v.length > 20);
	let clean = out + err;
	for (const value of protectedValues)
		clean = clean.replaceAll(value, "[REDACTED]");
	// Query-bearing diagnostics are never public proof.
	clean = clean.replace(
		/https?:\/\/[^\s"'<>]*[?][^\s"'<>]*/g,
		"[REDACTED-URL]",
	);
	process.stdout.write(clean);
	let inspected = 0;
	for await (const path of new Bun.Glob("**/*.js").scan(
		`${import.meta.dir}/../dist/client`,
	)) {
		const text = await Bun.file(
			`${import.meta.dir}/../dist/client/${path}`,
		).text();
		if (protectedValues.some((v) => text.includes(v)))
			throw new Error("Client credential scan failed");
		inspected++;
	}
	const serverLog =
		(await Bun.file(log).text()) +
		(await Bun.file(`${state}/replica.log`).text());
	await chmod(`${state}/replica.log`, 0o600);
	if (
		protectedValues.some((v) => serverLog.includes(v)) ||
		/[?&](secret|code|userId)=/.test(serverLog)
	)
		throw new Error("Server log credential scan failed");
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/recovery-synthetic.json`,
		`${JSON.stringify({ at: new Date().toISOString(), appwrite: "2.6.2", sourceCommit: "54581f9698f9de23cf4b1432e353b3ee9b0012d5", resources: "nfe-auth-recovery-52", source: "synthetic only; SMTP capture", testExit: code, clientFilesScanned: inspected, sensitiveMatches: 0, oidc: "controlled signed protocol tests only; no actual Google exchange", productionGates: "source registry, Google domains, SMTP domain, target invalidation proof, dependency53 acceptance" }, null, "\t")}\n`,
	);
	if (code) process.exitCode = code;
} finally {
	server.kill();
	replica.kill();
	await Promise.all([server.exited, replica.exited]);
}
