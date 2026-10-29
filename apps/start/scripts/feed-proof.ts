import { chmod, mkdir } from "node:fs/promises";
import { bootstrap } from "./feed-bootstrap";
import { databaseId } from "./feed-capabilities";
import { fixtureSetup } from "./feed-fixtures";
import { endpoint, state } from "./feed-local";

const c = await bootstrap();
if (!(await Bun.file(`${state}/capabilities-ready`).exists())) {
	for (const script of ["feed-capabilities.ts", "feed-aggregate-probe.ts"]) {
		const p = Bun.spawn(["bun", `${import.meta.dir}/${script}`], {
			env: process.env,
			stdout: "ignore",
			stderr: "inherit",
		});
		if (await p.exited) throw new Error("Capability proof failed");
	}
}
await Bun.write(`${state}/capabilities-ready`, "1");
const fixture = await fixtureSetup();
// Owned loopback-only observation bridge; no credentials, response rows or
// request bodies are retained. Account bytes are included even without a trace.
const wire: Record<
	string,
	{
		calls: number;
		requestPathAndBodyBytes: number;
		responseBodyBytes: number;
		statuses: Record<string, number>;
	}
> = {};
const proxy = Bun.serve({
	hostname: "127.0.0.1",
	port: 19565,
	async fetch(request) {
		const url = new URL(request.url),
			headers = new Headers(request.headers);
		headers.delete("host");
		headers.set("accept-encoding", "identity");
		const body =
			request.method === "GET" || request.method === "HEAD"
				? undefined
				: await request.arrayBuffer();
		const response = await fetch(new URL(url.pathname + url.search, endpoint), {
			method: request.method,
			headers,
			body,
			redirect: "manual",
		});
		const bytes = await response.arrayBuffer(),
			key =
				request.headers.get("x-nfe-proof-trace") ??
				"unlabelled-auth-and-profile";
		wire[key] ??= {
			calls: 0,
			requestPathAndBodyBytes: 0,
			responseBodyBytes: 0,
			statuses: {},
		};
		const metric = wire[key];
		metric.calls++;
		metric.requestPathAndBodyBytes +=
			Buffer.byteLength(url.pathname + url.search) + (body?.byteLength ?? 0);
		metric.responseBodyBytes += bytes.byteLength;
		metric.statuses[String(response.status)] =
			(metric.statuses[String(response.status)] ?? 0) + 1;
		const out = new Headers(response.headers);
		for (const name of [
			"content-length",
			"transfer-encoding",
			"content-encoding",
		])
			out.delete(name);
		return new Response(bytes, { status: response.status, headers: out });
	},
});
const env = {
	...process.env,
	START_APP_ORIGIN: "http://127.0.0.1:3554",
	START_APPWRITE_ENDPOINT: "http://127.0.0.1:19565/v1",
	START_APPWRITE_PROJECT: c.project,
	START_APPWRITE_SESSION_KEY: c.sessionKey,
	START_APPWRITE_PROFILE_WRITER_KEY: c.writerKey,
	START_APPWRITE_FEED_READER_KEY: c.readerKey,
	START_APPWRITE_DATABASE: databaseId,
	START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
	START_FEED_TRACE: "1",
	PORT: "3554",
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
let code = 1;
try {
	for (let i = 0; i < 80; i++) {
		try {
			if ((await fetch(`${env.START_APP_ORIGIN}/en/about`)).ok) break;
		} catch {}
		if (server.exitCode !== null) throw new Error("Server exited");
		await Bun.sleep(250);
	}
	const tests = Bun.spawn(
		[
			"bun",
			"x",
			"--no-install",
			"playwright",
			"test",
			"--config",
			"playwright.feed.config.ts",
			...(process.env.NFE_FEED_PROOF_PHASE === "performance"
				? ["--grep", "declared synthetic performance"]
				: []),
		],
		{ cwd: `${import.meta.dir}/..`, env, stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, exit] = await Promise.all([
		new Response(tests.stdout).text(),
		new Response(tests.stderr).text(),
		tests.exited,
	]);
	code = exit;
	const protectedValues = [
		c.proofKey,
		c.readerKey,
		c.sessionKey,
		c.writerKey,
		...fixture.actors.flatMap((a: { secret: string; password: string }) => [
			a.secret,
			a.password,
		]),
	];
	await Bun.write(`${state}/test.log`, out + err);
	await chmod(`${state}/test.log`, 0o600);
	let diagnostic = out + err;
	for (const secret of protectedValues)
		diagnostic = diagnostic.replaceAll(secret, "[REDACTED]");
	console.log(diagnostic);
	let files = 0;
	for await (const path of new Bun.Glob("**/*.js").scan(
		`${import.meta.dir}/../dist/client`,
	)) {
		const text = await Bun.file(
			`${import.meta.dir}/../dist/client/${path}`,
		).text();
		if (protectedValues.some((s: string) => text.includes(s)))
			throw new Error("Client secret leak");
		files++;
	}
	const logs = await Bun.file(log).text();
	if (protectedValues.some((s: string) => logs.includes(s)))
		throw new Error("Server log secret leak");
	type TraceCall = {
		trace: string | null;
		feedCall: string;
		rows: number;
		bytes: number;
		queries: string[];
		ms: number;
	};
	const calls: TraceCall[] = logs
		.split("\n")
		.filter((l) => l.startsWith('{"trace"'))
		.map((l) => JSON.parse(l));
	const traced = Object.groupBy(calls, (call) => call.trace ?? "unlabelled");
	const groups = Object.entries(traced)
		.filter(([key]) => key !== "unlabelled")
		.map(([trace, rows]) => ({
			trace,
			calls: rows!.length,
			rows: rows!.reduce((n: number, r: { rows: number }) => n + r.rows, 0),
			bytes: rows!.reduce((n: number, r: { bytes: number }) => n + r.bytes, 0),
			tables: rows!.map((r: { feedCall: string }) => r.feedCall),
		}));
	const performanceGroups = Object.groupBy(
		groups.filter((g) => g.trace.startsWith("perf-")),
		(g) => g.trace.replace(/-\d+$/, ""),
	);
	const distributions = Object.entries(performanceGroups).map(
		([scenario, items]) => ({
			scenario,
			samples: items!.length,
			calls: items!.map((i) => i.calls),
			rows: items!.map((i) => i.rows),
			bytes: items!.map((i) => i.bytes),
		}),
	);
	const sourceFiles: Record<string, string> = {};
	for await (const path of new Bun.Glob(
		"{src,scripts,tests}/**/*.{ts,tsx}",
	).scan(`${import.meta.dir}/..`)) {
		sourceFiles[path] = new Bun.CryptoHasher("sha256")
			.update(await Bun.file(`${import.meta.dir}/../${path}`).arrayBuffer())
			.digest("hex");
	}
	await mkdir(`${import.meta.dir}/../evidence`, { recursive: true });
	await Bun.write(
		`${import.meta.dir}/../evidence/${process.env.NFE_FEED_PROOF_PHASE === "performance" ? "feed-performance-runtime" : "feed-runtime"}.json`,
		`${JSON.stringify({ at: new Date().toISOString(), appwrite: "2.6.2", sdk: "31.1.0", source: "synthetic only", testExit: exit, clientSensitiveScan: { files, matches: 0 }, buildSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(`${import.meta.dir}/../dist/server/server.js`).arrayBuffer()).digest("hex"), wireMeasurement: { transport: "loopback observation bridge19565 to19564, accept-encoding identity; body bytes exclude HTTP headers/TLS; SDK decoded payload sizes separately labelled", groups: wire }, sourceFiles, untracedKnownAppwriteCalls: { publicProfileSSR: 1 }, traceGroups: groups.filter((g) => !g.trace.startsWith("perf-")), distributions, exactAppwriteRequests: calls.filter((c: { trace: string | null }) => c.trace?.startsWith("structure-") || c.trace?.startsWith("hidden-")), productionGates: "unmet: representative source, numerical budgets and production media" }, null, 2)}\n`,
	);
} finally {
	server.kill();
	await server.exited;
	proxy.stop(true);
}
process.exit(code);
