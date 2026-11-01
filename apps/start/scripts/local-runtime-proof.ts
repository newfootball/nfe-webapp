import assert from "node:assert/strict";
import { chmod, rm } from "node:fs/promises";
import { Account, Client, Query, TablesDB, Users } from "node-appwrite";
import {
	command,
	composeArgs,
	main,
	release,
	runtimeConfig,
	verifyRelease,
} from "./local-runtime";
import type { Credentials } from "./local-runtime-bootstrap";
import { revokeCreatedSessions } from "./local-runtime-browser-sessions";
import { cleanupAll } from "./local-runtime-cleanup";
import { ownedCommand } from "./local-runtime-command";
import { foregroundCancellation, launchRuntime } from "./local-runtime-process";
import {
	appRoot,
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
	let secret: string | undefined;
	let revokeBrowserSessions:
		| ((signal: AbortSignal) => Promise<void>)
		| undefined;
	const browserSession = `${state}/browser-session-${crypto.randomUUID()}.json`;
	async function readBrowserSession() {
		if (!(await Bun.file(browserSession).exists())) return;
		const value = await readPrivate<{ cookie: string; secret: string }>(
			browserSession,
		);
		assert.ok(value.cookie && value.secret);
		secret = value.secret;
		protectedValues.push(value.cookie, value.secret);
		return value;
	}
	let supervisor:
		| Awaited<ReturnType<typeof launchRuntime>>["supervisor"]
		| undefined;
	let runtime: Awaited<ReturnType<typeof launchRuntime>> | undefined;
	const foreground = foregroundCancellation();
	let artifactDigest: string | undefined;
	let succeeded = false;
	let phase = "prepare";
	const protectedValues: string[] = [];
	const checks: string[] = [];
	async function record(name: string, run: () => Promise<void>) {
		phase = name;
		if (foreground.signal.aborted) throw new Error("Proof cancelled");
		await run();
		checks.push(name);
	}
	async function stopApp() {
		if (runtime) {
			const results = await runtime.stop();
			assert.ok(
				results.every((result) => result.ok),
				"Owned foreground cleanup failed",
			);
			assert.equal(runtime.app.exitCode, 0, "App did not gracefully exit");
			runtime = undefined;
			server = undefined;
			supervisor = undefined;
		}
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
		runtime = await launchRuntime(directory, await runtimeConfig(), log, {
			signal: foreground.signal,
		});
		server = runtime.app;
		supervisor = runtime.supervisor;
		for (let attempt = 0; attempt < 80; attempt++) {
			if (foreground.signal.aborted) throw new Error("Proof startup cancelled");
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
		await record(
			"Node24 browser runtime is verified before backend startup",
			async () => {
				const version = await ownedCommand(["node", "--version"], appRoot, {
					timeoutMs: 3000,
					signal: foreground.signal,
					env: { PATH: process.env.PATH },
				});
				assert.match(version.trim(), /^v24\.\d+\.\d+$/);
			},
		);
		await main("prepare", undefined, foreground.signal);
		const composeBefore = hash(await Bun.file(`${state}/compose.json`).text());
		await main("prepare", undefined, foreground.signal);
		assert.equal(
			hash(await Bun.file(`${state}/compose.json`).text()),
			composeBefore,
		);
		checks.push("repeat prepare preserves private compose bytes");
		phase = "backend up";
		await main("up", undefined, foreground.signal);
		phase = "provision";
		await main("provision", undefined, foreground.signal);
		const credentials = await readPrivate<Credentials>(
			`${state}/credentials.json`,
		);
		const fixture = await readPrivate<{
			id: string;
			email: string;
			password: string;
		}>(`${state}/fixture.json`);
		protectedValues.push(
			credentials.provision,
			credentials.health,
			credentials.notification,
			credentials.session,
			credentials.reader,
			credentials.writer,
			fixture.password,
		);
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
				await main("provision", undefined, foreground.signal);
				assert.deepEqual(await snapshot(), before);
				assert.deepEqual(await fingerprints(), configBefore);
			},
		);
		Object.assign(process.env, await runtimeConfig());
		const { notificationId, notificationTransaction, stageLegacyNotification } =
			await import("../src/lib/notification-outbox.server");
		const deliveryEvent = "legacy:local-runtime-smoke-v1",
			deliveryId = notificationId(deliveryEvent);
		try {
			await db.getRow({
				databaseId,
				tableId: "notification_outbox_v1",
				rowId: deliveryId,
			});
		} catch (error) {
			if ((error as { code?: number }).code !== 404) throw error;
			await notificationTransaction(db, (tx) =>
				stageLegacyNotification(tx, {
					version: 1,
					eventId: deliveryEvent,
					type: "FOLLOW",
					actorId: null,
					recipientId: fixture.id,
					targetId: null,
					entityId: fixture.id,
					occurredAt: "2026-10-31T00:00:00.000Z",
				}),
			);
		}

		const first = await release(),
			second = await release();
		artifactDigest = first.digest;
		assert.equal(first.digest, second.digest);
		checks.push("two release packages have identical content digest");
		await startApp(first.digest);
		await record("health and SSR use the immutable artifact", async () => {
			assert.equal((await request("/_local/health")).status, 200);
			const response = await request("/fr");
			assert.equal(response.status, 200);
			assert.ok((await response.text()).includes("<html"));
		});
		await record(
			"foreground consumer delivers one durable synthetic event",
			async () => {
				let delivered = false;
				for (let i = 0; i < 60; i++) {
					try {
						await db.getRow({
							databaseId,
							tableId: "notifications_v1",
							rowId: deliveryId,
						});
						delivered = true;
						break;
					} catch (error) {
						if ((error as { code?: number }).code !== 404) throw error;
					}
					await Bun.sleep(250);
				}
				assert.ok(delivered);
				assert.equal(
					(
						await db.getRow({
							databaseId,
							tableId: "notification_outbox_v1",
							rowId: deliveryId,
						})
					).status,
					"DELIVERED",
				);
			},
		);

		const baselineSessions = await users.listSessions({ userId: fixture.id });
		assert.equal(baselineSessions.sessions.length, baselineSessions.total);
		revokeBrowserSessions = async (signal) => {
			const path = `${endpoint}/users/${encodeURIComponent(fixture.id)}/sessions`;
			const headers = {
				"X-Appwrite-Project": projectId,
				"X-Appwrite-Key": credentials.provision,
			};
			await revokeCreatedSessions(
				baselineSessions.sessions.map((session) => session.$id),
				async () => {
					const response = await fetch(path, { headers, signal });
					assert.ok(response.ok);
					return (await response.json()) as {
						total: number;
						sessions: { $id: string }[];
					};
				},
				async (id) => {
					const response = await fetch(`${path}/${encodeURIComponent(id)}`, {
						method: "DELETE",
						headers,
						signal,
					});
					assert.ok(response.ok || response.status === 404);
				},
			);
		};
		phase = "bounded Node24 browser login";
		await ownedCommand(
			[
				"node",
				`${appRoot}/scripts/local-runtime-browser.mjs`,
				`${state}/fixture.json`,
				browserSession,
			],
			appRoot,
			{
				timeoutMs: 60_000,
				signal: foreground.signal,
				env: {
					PATH: process.env.PATH,
					HOME: process.env.HOME,
					PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL,
				},
			},
		);
		const browserIdentity = await readBrowserSession();
		assert.ok(browserIdentity);
		const cookieHeader = `nfe-session-dev=${browserIdentity.cookie}`;
		protectedValues.push(
			credentials.provision,
			credentials.health,
			credentials.notification,
			credentials.session,
			credentials.reader,
			credentials.writer,
			fixture.password,
			browserIdentity.secret,
		);
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
				assert.equal(
					(
						await db.listRows({
							databaseId,
							tableId: "notifications_v1",
							queries: [Query.equal("eventId", deliveryEvent)],
						})
					).total,
					1,
				);
			},
		);
		for (const service of [
			"appwrite-geo",
			"appwrite-worker-databases",
			"appwrite-worker-deletes",
		]) {
			await record(
				`missing ${service} fails readiness and recovers`,
				async () => {
					await command([...composeArgs, "stop", "--timeout", "10", service]);
					await Bun.sleep(1500);
					assert.equal((await request("/_local/ready")).status, 503);
					await command([
						...composeArgs,
						"up",
						"-d",
						"--wait",
						"--wait-timeout",
						"180",
						"--pull",
						"never",
						service,
					]);
					for (let i = 0; i < 40; i++) {
						if ((await request("/_local/ready")).status === 200) break;
						await Bun.sleep(250);
					}
					assert.equal((await request("/_local/ready")).status, 200);
				},
			);
		}
		await record(
			"missing/stale supervisor report fails readiness",
			async () => {
				assert.ok(supervisor);
				const report = await readPrivate<Record<string, unknown>>(
					`${state}/dependencies.json`,
				);
				await supervisor.stop();
				supervisor = undefined;
				assert.equal((await request("/_local/ready")).status, 503);
				await createPrivate(`${state}/dependencies.json`, {
					...report,
					checkedAt: Date.now() - 11_000,
				});
				assert.equal((await request("/_local/ready")).status, 503);
				await rm(`${state}/dependencies.json`);
				await stopApp();
				await startApp(first.digest);
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
				await main("up", undefined, foreground.signal);
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
		await record(
			"container recreation preserves volumes, identity, profile, configuration and session",
			async () => {
				const idsBefore = (await command([...composeArgs, "ps", "--all", "-q"]))
					.trim()
					.split("\n")
					.sort();
				const volumeNames = (
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
					.split("\n")
					.sort();
				const inspectVolumes = () =>
					command([
						"docker",
						"volume",
						"inspect",
						"--format",
						"{{.Name}} {{.CreatedAt}}",
						...volumeNames,
					]);
				const volumesBefore = await inspectVolumes();
				await command([...composeArgs, "down", "--timeout", "30"]);
				assert.equal((await request("/_local/ready")).status, 503);
				await main("up", undefined, foreground.signal);
				const idsAfter = (await command([...composeArgs, "ps", "--all", "-q"]))
					.trim()
					.split("\n")
					.sort();
				assert.equal(idsAfter.length, 6);
				assert.ok(idsAfter.every((id) => !idsBefore.includes(id)));
				assert.equal(await inspectVolumes(), volumesBefore);
				assert.deepEqual(await fingerprints(), configBefore);
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
				for (let i = 0; i < 40; i++) {
					if ((await request("/_local/ready")).status === 200) break;
					await Bun.sleep(250);
				}
				assert.equal((await request("/_local/ready")).status, 200);
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
				.setSession(browserIdentity.secret),
		).deleteSession({ sessionId: "current" });
		secret = undefined;
		succeeded = true;
	} catch {
		succeeded = false;
	} finally {
		const cleanup = await cleanupAll([
			{
				name: "session",
				timeoutMs: 5000,
				run: async (signal) => {
					if (!secret) await readBrowserSession();
					if (secret) {
						const response = await fetch(
							`${endpoint}/account/sessions/current`,
							{
								method: "DELETE",
								signal,
								headers: {
									"X-Appwrite-Project": projectId,
									"X-Appwrite-Session": secret,
								},
							},
						);
						if (!response.ok && response.status !== 401)
							throw new Error("Session cleanup failed");
					}
				},
			},
			{
				name: "browser-created sessions",
				timeoutMs: 5000,
				run: async (signal) => {
					await revokeBrowserSessions?.(signal);
				},
			},
			{
				name: "foreground",
				timeoutMs: 45_000,
				run: async () => {
					if (runtime) {
						const result = await runtime.stop();
						if (result.some((item) => !item.ok))
							throw new Error("Foreground cleanup failed");
					}
				},
			},
			{
				name: "backend",
				timeoutMs: 45000,
				run: async (signal) => {
					if (await Bun.file(`${state}/compose.json`).exists())
						await command(
							[...composeArgs, "stop", "--timeout", "30"],
							undefined,
							{ timeoutMs: 40_000, signal },
						);
				},
			},
			{
				name: "browser handoff",
				timeoutMs: 1000,
				run: async () => {
					await rm(browserSession, { force: true });
				},
			},
		]);
		const logPath = `${state}/proof-server.log`;
		if (await Bun.file(logPath).exists()) {
			let text = await Bun.file(logPath).text();
			for (const value of protectedValues)
				text = text.replaceAll(value, "[REDACTED]");
			await Bun.write(logPath, text);
			await chmod(logPath, 0o600);
		}
		const result = {
			source: "synthetic local only",
			artifact: artifactDigest,
			succeeded: succeeded && cleanup.every((item) => item.ok),
			phase,
			checks,
			cleanup,
			excluded: [
				"B2",
				"production",
				"real import",
				"full graph63",
				"active56 branches",
			],
		};
		await createPrivate(`${state}/proof-${Date.now()}.json`, result);
		succeeded = result.succeeded;
		foreground.dispose();
	}
	if (!succeeded) throw new Error("Proof or owned cleanup failed");
	process.stdout.write(
		`Persistent local proof passed: ${checks.length} checks; own app/backend stopped, volumes retained.\n`,
	);
}
try {
	await proof();
} catch {
	process.stderr.write(
		"Persistent local proof failed; inspect private state using the runbook; no secret diagnostics emitted.\n",
	);
	process.exitCode = 1;
}
