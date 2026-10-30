import { chmod, mkdir } from "node:fs/promises";
import { databaseId, fixtures } from "./moderation-fixtures";
import { endpoint, state } from "./moderation-local";
import { proofProxy } from "./moderation-proxy";

const { c, fixture } = await fixtures();
const proxy = proofProxy(endpoint, c.writerKey);
const env = {
	...process.env,
	START_APP_ORIGIN: "http://127.0.0.1:3574",
	START_APPWRITE_ENDPOINT: proxy.endpoint,
	NFE_MODERATION_PROXY_CONTROL: proxy.control,
	NFE_MODERATION_PROXY_TOKEN: proxy.token,
	START_APPWRITE_PROJECT: c.project,
	START_APPWRITE_SESSION_KEY: c.sessionKey,
	START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
	START_APPWRITE_MODERATION_WRITER_KEY: c.writerKey,
	START_APPWRITE_MODERATION_READER_KEY: c.readerKey,
	START_APPWRITE_MEDIA_READER_KEY: c.readerKey,
	START_APPWRITE_MEDIA_WRITER_KEY: c.writerKey,
	START_APPWRITE_FEED_READER_KEY: c.readerKey,
	START_APPWRITE_DATABASE: databaseId,
	START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
	// Synthetic signer only; never used to contact Backblaze or create an object.
	B2_APPLICATION_KEY_ID: "synthetic-no-b2-access",
	B2_APPLICATION_KEY: "synthetic-no-b2-secret",
	B2_BUCKET_NAME: "synthetic",
	B2_REGION: "us-west-004",
	B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
	START_MEDIA_PREFIX: "moderation-proof/",
	PORT: "3574",
	NODE_ENV: "production",
};
const secrets = [
	proxy.token,
	c.proofKey,
	c.writerKey,
	c.sessionKey,
	c.readerKey,
	...fixture.actors.flatMap((a: { secret: string; password: string }) => [
		a.secret,
		a.password,
	]),
];
const log = `${state}/server.log`;
await Bun.write(log, "");
await chmod(log, 0o600);
const server = Bun.spawn(
	["bun", "--preload", "./scripts/moderation-signing-preload.ts", "server.ts"],
	{
		cwd: `${import.meta.dir}/..`,
		env,
		stdout: Bun.file(log),
		stderr: Bun.file(log),
	},
);
try {
	let ready = false;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			if ((await fetch(`${env.START_APP_ORIGIN}/fr`)).ok) {
				ready = true;
				break;
			}
		} catch {}
		if (server.exitCode !== null)
			throw new Error("Moderation proof server exited");
		await Bun.sleep(250);
	}
	if (!ready) throw new Error("Moderation proof server not ready");
	const p = Bun.spawn(
		[
			"bun",
			"x",
			"--no-install",
			"playwright",
			"test",
			"--config",
			"playwright.moderation.config.ts",
		],
		{ cwd: `${import.meta.dir}/..`, env, stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, exit] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	let diagnostic = out + err;
	for (const secret of secrets)
		diagnostic = diagnostic.replaceAll(secret, "[REDACTED]");
	process.stdout.write(diagnostic);
	let scanned = 0;
	for await (const path of new Bun.Glob("**/*.js").scan({
		cwd: `${import.meta.dir}/../dist/client`,
		absolute: true,
	})) {
		const content = await Bun.file(path).text();
		if (
			content.includes("START_APPWRITE_MODERATION_WRITER_KEY") ||
			secrets.some((s) => content.includes(s))
		)
			throw new Error("Moderation sensitive bundle scan failed");
		scanned++;
	}
	if (secrets.some((s) => diagnostic.includes(s)))
		throw new Error("Proof diagnostics contain secret");
	const logContent = await Bun.file(log).text();
	if (secrets.some((s) => logContent.includes(s)))
		throw new Error("Moderation server log contains secret");
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/moderation-synthetic.json`,
		`${JSON.stringify({ at: new Date().toISOString(), appwrite: "2.6.2", source: "synthetic only", testExit: exit, databaseId, sensitiveScan: { files: scanned, matches: 0 }, buildSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(`${import.meta.dir}/../dist/server/server.js`).arrayBuffer()).digest("hex"), limitations: ["Admin/reporting core #60 only; account lifecycle excluded", "External async signer mocked in test preload; no B2 object or TTL proof", "No full lifecycle56, real import or production acceptance"] }, null, 2)}\n`,
	);
	if (exit) throw new Error(`Moderation browser/RPC proof failed (${exit})`);
} finally {
	server.kill();
	await server.exited;
	proxy.stop();
}
