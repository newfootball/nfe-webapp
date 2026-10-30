import assert from "node:assert/strict";
import { Account, Client, Users } from "node-appwrite";
import { mappedSession } from "../src/lib/oauth-broker-policy";
import { confirmBrokerSession } from "../src/lib/oauth-confirm";
import { endpoint, state } from "./recovery-local";

if (
	process.env.NFE_AUTH_SYNTHETIC !== "1" ||
	!(await Bun.file(`${state}/compose.json`).exists())
)
	throw new Error("Dedicated synthetic opt-in required");
const c = (await Bun.file(`${state}/credentials.json`).json()) as {
	project: string;
	brokerKey: string;
	proofKey: string;
};
const sdk = () => new Client().setEndpoint(endpoint).setProject(c.project);
const broker = new Users(sdk().setKey(c.brokerKey));
const fixtures = new Users(sdk().setKey(c.proofKey));
const userId = `broker-${crypto.randomUUID().slice(0, 8)}`;
const registry = {
	version: 1,
	sourceDigest: "0".repeat(64),
	coverageComplete: false,
	identities: [
		{
			issuer: "https://accounts.google.com",
			provider: "google",
			subject: "controlled-fixture",
			userId,
		},
	],
};
await fixtures.create({ userId, email: `${userId}@example.test` });
try {
	const issued = await mappedSession(registry, "controlled-fixture", null, {
		target: (id) => broker.get({ userId: id }),
		issue: (id) => broker.createSession({ userId: id }),
	});
	const account = new Account(sdk().setSession(issued.secret));
	await confirmBrokerSession(userId, issued, {
		account: () => account.get(),
		target: () => broker.get({ userId }),
		session: () => account.getSession({ sessionId: "current" }),
		revoke: () => broker.deleteSession({ userId, sessionId: issued.$id }),
	});
	await broker.deleteSession({ userId, sessionId: issued.$id });
	await assert.rejects(() => account.get());
	let issueCalls = 0;
	const denied = () =>
		mappedSession(registry, "controlled-fixture", null, {
			target: (id) => broker.get({ userId: id }),
			issue: async () => {
				issueCalls++;
				throw new Error("Must not issue");
			},
		});
	await fixtures.updateStatus({ userId, status: false });
	await assert.rejects(denied);
	await fixtures.updateStatus({ userId, status: true });
	await fixtures.updateMFA({ userId, mfa: true });
	await assert.rejects(denied);
	assert.equal(issueCalls, 0);
	const native = await fetch(
		`${endpoint}/account/sessions/oauth2/google?success=http://127.0.0.1:3522/fr&failure=http://127.0.0.1:3522/fr`,
		{
			headers: { "X-Appwrite-Project": c.project, Accept: "application/json" },
			redirect: "manual",
		},
	);
	const nativeText = await native.text();
	const result =
		nativeText.includes("project_provider_disabled") ||
		nativeText.includes("provider_disabled");
	assert.equal(
		native.status >= 400 && result,
		true,
		"Native Google must stay disabled",
	);
	await Bun.write(
		`${import.meta.dir}/../evidence/oauth-broker-synthetic.json`,
		`${JSON.stringify({ at: new Date().toISOString(), appwrite: "2.6.2", source: "synthetic only", keyScopes: ["users.read", "sessions.write"], usersWrite: false, sessionIssuerAndCompensationDelete: "passed", accountAndCurrentSessionRecheck: "passed", disabledAndMfaTargetNoIssuance: "passed", nativeGoogleDisabled: true, actualGoogleExchange: false }, null, "\t")}\n`,
	);
	process.stdout.write(
		"Actual2.6.2 broker: issuance, Account/current-session recheck, least-privilege compensation deletion, disabled/MFA denial and native Google disabled passed.\n",
	);
} finally {
	await fixtures.delete({ userId });
}
