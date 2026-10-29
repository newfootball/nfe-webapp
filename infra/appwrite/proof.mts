import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
	compose,
	config,
	privateWrite,
	source,
	state,
	validate,
} from "./environment.mts";

let phase = "bootstrap";
// Writes synthetic identities only to the generated loopback instance. No remote endpoint accepted.
async function proof() {
	const c = await config();
	await validate();
	const endpoint = `http://localhost:${c.port}/v1`;
	const origin = `http://localhost:${c.browserPort}`;
	const results: Record<string, string> = {};
	const version = await fetch(`${endpoint}/health/version`);
	assert.equal(version.status, 200);
	assert.equal((await version.json()).version, "2.6.2");
	results.serverHealth = "passed (Bun fetch, not Start integration)";
	let cookie = "";
	async function api(path: string, body?: object) {
		phase = `console:${path}`;
		const r = await fetch(`${endpoint}${path}`, {
			method: body ? "POST" : "GET",
			headers: {
				"Content-Type": "application/json",
				"X-Appwrite-Project": "console",
				Origin: origin,
				Cookie: cookie,
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = await r.json();
		if (!r.ok)
			throw Object.assign(
				new Error(`Console request ${path} HTTP ${r.status} type ${data.type}`),
				{ code: r.status },
			);
		if (r.headers.getSetCookie().length)
			cookie = r.headers
				.getSetCookie()
				.map((v) => v.split(";")[0])
				.join("; ");
		return data;
	}
	const adminPath = `${state}/admin.json`;
	const exists = await Bun.file(adminPath).exists();
	const admin = exists
		? await Bun.file(adminPath).json()
		: { password: `Nfe-${crypto.randomUUID()}-Aa1!` };
	await privateWrite(adminPath, admin);
	if (!exists)
		await api("/account", {
			userId: "nfe46-admin",
			email: "admin@example.test",
			name: "Synthetic local operator",
			password: admin.password,
		});
	await api("/account/sessions/email", {
		email: "admin@example.test",
		password: admin.password,
	});
	async function ensure(path: string, id: string, body: object) {
		try {
			await api(`${path}/${id}`);
		} catch (error) {
			if ((error as { code?: number }).code !== 404) throw error;
			await api(path, body);
		}
	}
	await ensure("/teams", "nfe46-team", {
		teamId: "nfe46-team",
		name: "Local isolated team",
	});
	await ensure("/projects", "nfe46-local", {
		projectId: "nfe46-local",
		name: "Local isolated project",
		teamId: "nfe46-team",
	});
	await ensure("/projects/nfe46-local/platforms", "local-web", {
		platformId: "local-web",
		name: "Local browser",
		hostname: "localhost",
	});

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: c.browserPort,
		fetch: () =>
			new Response(
				"<!doctype html><title>NFE isolated infrastructure proof</title>",
				{ headers: { "Content-Type": "text/html" } },
			),
	});
	phase = "browser-launch";
	let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
	try {
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();
		await page.goto(origin);
		const identityPath = `${state}/identity.json`;
		const identityExists = await Bun.file(identityPath).exists();
		const identity = identityExists
			? await Bun.file(identityPath).json()
			: {
					id: `test${Date.now()}`,
					email: `test${Date.now()}@example.test`,
					password: `Nfe-${crypto.randomUUID()}-Aa1!`,
				};
		await privateWrite(identityPath, identity);
		phase = "browser-auth";
		const auth = await page.evaluate(
			async ({ endpoint, identity, create, origin }) => {
				async function req(path: string, body?: object) {
					const r = await fetch(`${endpoint}${path}`, {
						method: body ? "POST" : "GET",
						credentials: "include",
						headers: {
							"Content-Type": "application/json",
							"X-Appwrite-Project": "nfe46-local",
						},
						body: body ? JSON.stringify(body) : undefined,
					});
					if (!r.ok) throw new Error(`Auth ${path} HTTP ${r.status}`);
					return r.json();
				}
				if (create)
					await req("/account", {
						userId: identity.id,
						email: identity.email,
						password: identity.password,
					});
				await req("/account/sessions/email", {
					email: identity.email,
					password: identity.password,
				});
				const account = await req("/account");
				await req("/account/verification", { url: `${origin}/verified` });
				return { id: account.$id, cookiesEnabled: navigator.cookieEnabled };
			},
			{ endpoint, identity, create: !identityExists, origin },
		);
		assert.equal(auth.id, identity.id);
		assert.equal(auth.cookiesEnabled, true);
		results.browserAuthCorsCookies =
			"passed: allowlisted localhost platform, credentialed browser login and account read";
		phase = "mail-capture";
		let captured = false;
		for (let i = 0; i < 40; i++) {
			const messages = await fetch(
				`http://localhost:${c.port}/mail/api/v1/messages`,
			).then((r) => r.json());
			if (
				messages.messages?.some((m: { To: { Address: string }[] }) =>
					m.To?.some((to) => to.Address === identity.email),
				)
			) {
				captured = true;
				break;
			}
			await Bun.sleep(500);
		}
		assert.ok(captured, "Auth verification must reach Mailpit only");
		results.authSmtpSink =
			"passed: synthetic verification captured, no SMTP relay and internal-only network";
		// Appwrite's health endpoint is public; account APIs must reject unregistered web origins.
		phase = "denied-origin";
		const deniedOrigin = "https://unregistered.example.test";
		const deniedResponse = await fetch(`${endpoint}/account`, {
			headers: { Origin: deniedOrigin, "X-Appwrite-Project": "nfe46-local" },
		});
		assert.equal(deniedResponse.status, 403);
		assert.equal((await deniedResponse.json()).type, "general_unknown_origin");
		assert.equal(
			deniedResponse.headers.get("access-control-allow-origin"),
			null,
		);
		// Route only the test document; API calls reach the same real Appwrite.
		await page.route(`${deniedOrigin}/`, (route) =>
			route.fulfill({
				contentType: "text/html",
				body: "<!doctype html><title>Unregistered origin</title>",
			}),
		);
		// Grant Chromium local network access so CORS, rather than address-space
		// policy, decides this request. Never disable browser web security.
		await page
			.context()
			.grantPermissions(["local-network-access"], { origin: deniedOrigin });
		await page.goto(deniedOrigin);
		const network = await page.context().newCDPSession(page);
		await network.send("Network.enable");
		const accountRequests = new Set<string>();
		network.on("Network.requestWillBeSent", ({ requestId, request }) => {
			if (request.url === `${endpoint}/account`) accountRequests.add(requestId);
		});
		// Playwright response events omit CORS-denied responses; CDP retains
		// the real wire status and headers, bound to this exact API request.
		let wireDenied = false;
		network.on(
			"Network.responseReceivedExtraInfo",
			({ requestId, statusCode, headers }) => {
				if (accountRequests.has(requestId)) {
					assert.equal(statusCode, 403);
					assert.ok(
						!Object.keys(headers).some(
							(key) => key.toLowerCase() === "access-control-allow-origin",
						),
					);
					wireDenied = true;
				}
			},
		);
		const rejected = await page.evaluate(async (endpoint) => {
			try {
				await fetch(`${endpoint}/account`, {
					headers: { "X-Appwrite-Project": "nfe46-local" },
					credentials: "include",
				});
				return false;
			} catch {
				return true;
			}
		}, endpoint);
		assert.ok(
			wireDenied,
			"Browser API request must receive HTTP403 without ACAO",
		);
		await network.detach();
		assert.ok(
			rejected,
			"Unregistered nonloopback origin must be blocked by browser CORS",
		);
		results.deniedOrigin =
			"passed: unregistered nonloopback origin returns HTTP403 general_unknown_origin without ACAO; real browser response inaccessible";
		phase = "persistence";
		await compose("down");
		await compose("up", "-d", "--wait", "--wait-timeout", "240");
		await page.goto(origin);
		const persisted = await page.evaluate(async (endpoint) => {
			const r = await fetch(`${endpoint}/account`, {
				credentials: "include",
				headers: { "X-Appwrite-Project": "nfe46-local" },
			});
			if (!r.ok) throw new Error(`Persistence HTTP ${r.status}`);
			return (await r.json()).$id;
		}, endpoint);
		assert.equal(persisted, identity.id);
		results.persistence =
			"passed: containers and networks recreated, volumes and browser session retained";
		await privateWrite(`${state}/evidence.json`, {
			at: new Date().toISOString(),
			source,
			project: c.project,
			results,
			externalGates: [
				"Start server integration",
				"staging/production host and TLS",
				"staging SMTP domain and delivery",
				"restricted B2 staging/production buckets and keys",
			],
		});
		process.stdout.write(
			`${Object.keys(results).length} infrastructure checks passed; sanitized evidence saved in .local/evidence.json.\n`,
		);
	} finally {
		await browser?.close();
		server.stop(true);
	}
}
try {
	await proof();
} catch (error) {
	// Error messages from SDKs or raw HTTP responses are never printed.
	process.stderr.write(
		`Infrastructure proof failed at ${phase} (${error instanceof assert.AssertionError || (error instanceof Error && error.message.startsWith("Console request")) ? error.message : `runtime ${error instanceof Error ? error.name : "unknown"}; details suppressed`}).\n`,
	);
	process.exitCode = 1;
}
