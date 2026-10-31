import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { Account, Client, TablesDB, Users } from "node-appwrite";
import {
	command,
	main,
	release,
	runtimeConfig,
	verifyRelease,
} from "./local-runtime";
import type { Credentials } from "./local-runtime-bootstrap";
import {
	createPrivate,
	databaseId,
	endpoint,
	fileManifest,
	hash,
	origin,
	project,
	projectId,
	readPrivate,
	state,
} from "./local-runtime-state";

async function proof() {
	assert.equal(
		process.env.NFE_LOCAL_RUNTIME_LEASE,
		"64",
		"Explicit exclusive backend lease required",
	);
	let server: ReturnType<typeof Bun.spawn> | undefined;
	let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
	let secret: string | undefined;
	const checks: string[] = [];
	async function record(name: string, run: () => Promise<void>) {
		await run();
		checks.push(name);
	}
	async function stopApp() {
		if (!server) return;
		server.kill("SIGTERM");
		const exit = await Promise.race([
			server.exited,
			Bun.sleep(12_000).then(() => {
				throw new Error("App shutdown timeout");
			}),
		]);
		assert.equal(exit, 0, "App did not gracefully exit");
		server = undefined;
	}
	const request = (path: string, cookie?: string) =>
		fetch(`${origin}${path}`, {
			signal: AbortSignal.timeout(5000),
			headers: cookie ? { Cookie: cookie } : {},
			redirect: "manual",
		});
	async function startApp(digest: string) {
		const directory = await verifyRelease(digest);
		const log = `${state}/proof-server.log`;
		await Bun.write(log, "");
		await chmod(log, 0o600);
		server = Bun.spawn([process.execPath, `${directory}/app.js`], {
			cwd: directory,
			env: await runtimeConfig(),
			stdout: Bun.file(log),
			stderr: Bun.file(log),
		});
		for (let attempt = 0; attempt < 80; attempt++) {
			try {
				if ((await request("/_local/ready")).status === 200) return;
			} catch {}
			if (server.exitCode !== null)
				throw new Error("Artifact exited before readiness");
			await Bun.sleep(250);
		}
		throw new Error("Artifact readiness timed out");
	}
	try {
		await main("prepare");
		const composeBefore = hash(await Bun.file(`${state}/compose.json`).text());
		await main("prepare");
		assert.equal(
			hash(await Bun.file(`${state}/compose.json`).text()),
			composeBefore,
		);
		checks.push("repeat prepare preserves private compose bytes");
		await main("up");
		await main("provision");
		const credentials = await readPrivate<Credentials>(
			`${state}/credentials.json`,
		);
		const fixture = await readPrivate<{
			id: string;
			email: string;
			password: string;
		}>(`${state}/fixture.json`);
		const admin = new Client()
			.setEndpoint(endpoint)
			.setProject(projectId)
			.setKey(credentials.provision);
		const db = new TablesDB(admin),
			users = new Users(admin);
		async function snapshot() {
			return {
				user: await users.get({ userId: fixture.id }),
				profile: await db.getRow({
					databaseId,
					tableId: "profiles",
					rowId: fixture.id,
				}),
				privateProfile: await db.getRow({
					databaseId,
					tableId: "private_profiles",
					rowId: fixture.id,
				}),
			};
		}
		const before = await snapshot();
		const stateFiles = [
			"compose.json",
			"console.json",
			"credentials.json",
			"fixture.json",
			"runtime.json",
		];
		const fingerprints = async () =>
			Object.fromEntries(
				await Promise.all(
					stateFiles.map(async (file) => [
						file,
						hash(await Bun.file(`${state}/${file}`).text()),
					]),
				),
			);
		const configBefore = await fingerprints();
		await record(
			"repeat provision preserves identities, rows, dates and configuration",
			async () => {
				await main("provision");
				assert.deepEqual(await snapshot(), before);
				assert.deepEqual(await fingerprints(), configBefore);
			},
		);
		const first = await release(),
			second = await release();
		assert.equal(first.digest, second.digest);
		checks.push("two release packages have identical content digest");
		await startApp(first.digest);
		await record("health and SSR use the immutable artifact", async () => {
			assert.equal((await request("/_local/health")).status, 200);
			const response = await request("/fr");
			assert.equal(response.status, 200);
			assert.ok((await response.text()).includes("<html"));
		});
		browser = await chromium.launch({
			channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
		});
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${origin}/fr/private`);
		assert.ok(page.url().includes("/fr/sign-in"));
		await page.getByLabel("Adresse e-mail").fill(fixture.email);
		await page.getByLabel("Mot de passe").fill(fixture.password);
		await page.getByRole("button", { name: "Connexion", exact: true }).click();
		await page.getByTestId("identity").waitFor();
		assert.equal(await page.getByTestId("identity").innerText(), fixture.id);
		const cookie = (await context.cookies()).find(
			(c) => c.name === "nfe-session-dev",
		);
		assert.ok(cookie?.httpOnly && cookie.sameSite === "Lax");
		secret = cookie.value;
		const cookieHeader = `nfe-session-dev=${secret}`;
		const protectedValues = [
			credentials.provision,
			credentials.session,
			credentials.reader,
			credentials.writer,
			fixture.password,
			secret,
		];
		await record(
			"browser login and direct private SSR with real Appwrite session",
			async () => {
				const response = await request("/fr/private", cookieHeader),
					html = await response.text();
				assert.equal(response.status, 200);
				assert.ok(html.includes(fixture.id));
				assert.ok(response.headers.get("cache-control")?.includes("no-store"));
				assert.ok(!protectedValues.some((value) => html.includes(value)));
				const profile = await request(`/fr/user/${fixture.id}`);
				assert.equal(profile.status, 200);
				assert.ok((await profile.text()).includes("Synthetic local player"));
			},
		);
		await browser.close();
		browser = undefined;
		await record(
			"graceful app stop and same-artifact restart retain login",
			async () => {
				await stopApp();
				await startApp(first.digest);
				assert.ok(
					(await (await request("/fr/private", cookieHeader)).text()).includes(
						fixture.id,
					),
				);
			},
		);
		await record(
			"backend shutdown makes readiness fail while liveness remains healthy",
			async () => {
				await main("stop");
				assert.equal((await request("/_local/health")).status, 200);
				assert.equal((await request("/_local/ready")).status, 503);
			},
		);
		await record(
			"backend restart preserves persistent identity, profile, config and session",
			async () => {
				await main("up");
				assert.equal((await request("/_local/ready")).status, 200);
				assert.equal(
					(await users.get({ userId: fixture.id })).$createdAt,
					before.user.$createdAt,
				);
				assert.deepEqual(
					await db.getRow({
						databaseId,
						tableId: "profiles",
						rowId: fixture.id,
					}),
					before.profile,
				);
				assert.deepEqual(await fingerprints(), configBefore);
				assert.ok(
					(await (await request("/fr/private", cookieHeader)).text()).includes(
						fixture.id,
					),
				);
			},
		);
		await stopApp();
		await record(
			"artifact, client and app diagnostics contain no runtime credential values",
			async () => {
				for (const path of Object.keys(await fileManifest(first.directory))) {
					const text = await Bun.file(`${first.directory}/${path}`).text();
					assert.ok(!protectedValues.some((value) => text.includes(value)));
				}
				const log = await Bun.file(`${state}/proof-server.log`).text();
				assert.ok(!protectedValues.some((value) => log.includes(value)));
			},
		);
		await new Account(
			new Client()
				.setEndpoint(endpoint)
				.setProject(projectId)
				.setSession(secret),
		).deleteSession({ sessionId: "current" });
		secret = undefined;
		await main("stop");
		const containers = await command([
			"docker",
			"ps",
			"-q",
			"--filter",
			`label=com.docker.compose.project=${project}`,
		]);
		assert.equal(containers.trim(), "");
		const volumes = (
			await command([
				"docker",
				"volume",
				"ls",
				"-q",
				"--filter",
				`label=com.docker.compose.project=${project}`,
			])
		)
			.trim()
			.split("\n");
		assert.ok(volumes.length > 1);
		await createPrivate(`${state}/proof-${Date.now()}.json`, {
			source: "synthetic local only",
			artifact: first.digest,
			checks,
			cleanup: {
				appStopped: true,
				containersStopped: true,
				persistentVolumes: volumes,
			},
			excluded: [
				"B2",
				"production",
				"real import",
				"full graph63",
				"active56/58 branches",
			],
		});
		process.stdout.write(
			`Persistent local proof passed: ${checks.length} checks; artifact${first.digest}; own app/backend stopped, volumes retained.\n`,
		);
	} finally {
		if (browser) await browser.close();
		if (secret) {
			try {
				await new Account(
					new Client()
						.setEndpoint(endpoint)
						.setProject(projectId)
						.setSession(secret),
				).deleteSession({ sessionId: "current" });
			} catch {}
		}
		if (server) {
			server.kill("SIGTERM");
			await server.exited;
		}
		if (await Bun.file(`${state}/compose.json`).exists()) await main("stop");
	}
}
try {
	await proof();
} catch {
	process.stderr.write(
		"Persistent local proof failed; inspect private state using the runbook; no secret diagnostics emitted.\n",
	);
	process.exitCode = 1;
}
