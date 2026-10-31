import { chmod, mkdir } from "node:fs/promises";
import { bootstrap } from "./messaging-bootstrap";
import { databaseId, fixtures } from "./messaging-fixtures";
import { endpoint, state } from "./messaging-local";

const c = await bootstrap(),
	fixture = await fixtures();
const origin = "http://127.0.0.1:3590";
const probe = Bun.serve({
	hostname: "127.0.0.1",
	port: 3590,
	fetch: () => new Response(""),
});
probe.stop(true);
const log = `${state}/server.log`;
await Bun.write(log, "");
await chmod(log, 0o600);
const server = Bun.spawn(["bun", "server.ts"], {
	cwd: `${import.meta.dir}/..`,
	env: {
		...process.env,
		START_APP_ORIGIN: origin,
		START_APPWRITE_ENDPOINT: endpoint,
		START_APPWRITE_PROJECT: c.project,
		START_APPWRITE_SESSION_KEY: c.sessionKey,
		START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
		START_APPWRITE_MESSAGING_WRITER_KEY: c.messagingWriterKey,
		START_APPWRITE_NOTIFICATION_WRITER_KEY: c.notificationKey,
		START_APPWRITE_FEED_READER_KEY: c.readerKey,
		START_APPWRITE_DATABASE: databaseId,
		START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		PORT: "3590",
		NODE_ENV: "production",
	},
	stdout: Bun.file(log),
	stderr: Bun.file(log),
});
const secrets = [
	c.proofKey,
	c.messagingWriterKey,
	c.notificationKey,
	c.sessionKey,
	c.writerKey,
	c.readerKey,
	...fixture.actors.flatMap(
		(a: { secret: string; password: string; secondarySecret: string }) => [
			a.secret,
			a.password,
			a.secondarySecret,
		],
	),
];
let exit = 1;
try {
	let ready = false;
	for (let i = 0; i < 80; i++) {
		try {
			if ((await fetch(`${origin}/en/about`)).ok) {
				ready = true;
				break;
			}
		} catch {}
		if (server.exitCode !== null) throw new Error("Owned server exited");
		await Bun.sleep(250);
	}
	if (!ready) throw new Error("Owned server not ready");
	const tests = Bun.spawn(
		[
			"bun",
			"x",
			"--no-install",
			"playwright",
			"test",
			"--config",
			"playwright.messaging.config.ts",
		],
		{
			cwd: `${import.meta.dir}/..`,
			env: process.env,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [out, err, code] = await Promise.all([
		new Response(tests.stdout).text(),
		new Response(tests.stderr).text(),
		tests.exited,
	]);
	exit = code;
	let diagnostic = out + err;
	for (const secret of secrets)
		diagnostic = diagnostic.replaceAll(secret, "[REDACTED]");
	process.stdout.write(diagnostic);
	await Bun.write(`${state}/test.log`, diagnostic);
	await chmod(`${state}/test.log`, 0o600);
	let files = 0;
	for await (const path of new Bun.Glob("**/*.js").scan(
		`${import.meta.dir}/../dist/client`,
	)) {
		const text = await Bun.file(
			`${import.meta.dir}/../dist/client/${path}`,
		).text();
		if (secrets.some((s: string) => text.includes(s)))
			throw new Error("Client secret leak");
		files++;
	}
	const logs = await Bun.file(log).text();
	if (secrets.some((s: string) => logs.includes(s)))
		throw new Error("Server secret leak");
	const sourceFiles: Record<string, string> = {};
	for await (const path of new Bun.Glob(
		"{src,scripts,tests}/**/*.{ts,tsx}",
	).scan(`${import.meta.dir}/..`))
		sourceFiles[path] = new Bun.CryptoHasher("sha256")
			.update(await Bun.file(`${import.meta.dir}/../${path}`).arrayBuffer())
			.digest("hex");
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/messaging-runtime.json`,
		JSON.stringify(
			{
				at: new Date().toISOString(),
				appwrite: "2.6.2",
				sdk: "31.1.0",
				source: "isolated synthetic only",
				testExit: exit,
				clientSensitiveScan: { files, matches: 0 },
				buildSha256: new Bun.CryptoHasher("sha256")
					.update(
						await Bun.file(
							`${import.meta.dir}/../dist/server/server.js`,
						).arrayBuffer(),
					)
					.digest("hex"),
				sourceFiles,
				scope:
					"59 private messaging core; notification delivery awaits58; synthetic isolation only",
			},
			null,
			2,
		) + "\n",
	);
	const format = Bun.spawn(
		[
			"bun",
			"../../node_modules/@biomejs/biome/bin/biome",
			"format",
			"--write",
			"evidence/messaging-runtime.json",
		],
		{ cwd: `${import.meta.dir}/..`, stdout: "ignore", stderr: "pipe" },
	);
	if (await format.exited) throw new Error("Evidence formatting failed");
} finally {
	server.kill();
	await server.exited;
}
process.exit(exit);
