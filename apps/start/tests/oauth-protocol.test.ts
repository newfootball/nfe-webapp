import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import * as oidc from "openid-client";
import {
	acceptedSubject,
	googleConfiguration,
} from "../src/lib/oauth-protocol";
import { registrySchema, resolveSubject } from "../src/lib/oauth-registry";
import {
	changeSchema,
	recoveryInput,
	requestSchema,
	resetSchema,
} from "../src/lib/recovery-input";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});
const { privateKey: wrongKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});
const now = Math.floor(Date.now() / 1000);
const tx = {
	state: "synthetic-state",
	nonce: "synthetic-nonce",
	verifier: "a".repeat(43),
};
const redirect = "https://example.test/oauth/callback";
const base = {
	iss: "https://accounts.google.com",
	aud: "synthetic-client",
	sub: "synthetic-subject",
	nonce: tx.nonce,
	iat: now,
	exp: now + 300,
};
function signed(claims: object, key = privateKey) {
	const payload = [{ alg: "RS256", kid: "test", typ: "JWT" }, claims]
		.map((item) => Buffer.from(JSON.stringify(item)).toString("base64url"))
		.join(".");
	return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), key).toString("base64url")}`;
}
function provider(claims: object = base, key = privateKey) {
	const config = googleConfiguration("synthetic-client", "synthetic-secret");
	let exchanges = 0;
	config[oidc.customFetch] = async (input, options) => {
		if (String(input).includes("/certs"))
			return Response.json({
				keys: [
					{
						...publicKey.export({ format: "jwk" }),
						alg: "RS256",
						kid: "test",
						use: "sig",
					},
				],
			});
		exchanges++;
		const body = new URLSearchParams(String(options?.body));
		expect(body.get("code_verifier")).toBe(tx.verifier);
		expect(body.get("redirect_uri")).toBe(redirect);
		return Response.json({
			token_type: "Bearer",
			access_token: "synthetic-unused",
			expires_in: 300,
			id_token: signed(claims, key),
		});
	};
	return { config, exchanges: () => exchanges };
}
describe("controlled signed OIDC code grant (not actual Google)", () => {
	test("signature, nonce, audience, issuer and PKCE accepted", async () => {
		const { config } = provider();
		expect(
			await acceptedSubject(
				config,
				new URL(`${redirect}?code=one&state=${tx.state}`),
				tx,
				redirect,
			),
		).toBe("synthetic-subject");
	});
	for (const [name, claims, key] of [
		["wrong signature", base, wrongKey],
		["wrong nonce", { ...base, nonce: "other" }],
		["wrong issuer", { ...base, iss: "https://attacker.test" }],
		["wrong audience", { ...base, aud: "other" }],
		["wrong azp", { ...base, azp: "other" }],
		["expired", { ...base, exp: now - 600 }],
		["future issuance", { ...base, iat: now + 600 }],
		[
			"multiple audiences",
			{ ...base, aud: ["synthetic-client", "other"], azp: "synthetic-client" },
		],
	] as const)
		test(name, async () => {
			const { config } = provider(claims, key);
			await expect(
				acceptedSubject(
					config,
					new URL(`${redirect}?code=one&state=${tx.state}`),
					tx,
					redirect,
				),
			).rejects.toThrow();
		});
	for (const query of [
		"",
		"code=x",
		"code=x&state=wrong",
		`error=access_denied&state=${tx.state}`,
		`code=x&state=${tx.state}&state=${tx.state}`,
	])
		test(`invalid callback ${query}`, async () => {
			const p = provider();
			await expect(
				acceptedSubject(
					p.config,
					new URL(`${redirect}?${query}`),
					tx,
					redirect,
				),
			).rejects.toThrow();
			expect(p.exchanges()).toBe(0);
		});
});
const entry = {
	issuer: "https://accounts.google.com" as const,
	provider: "google" as const,
	subject: "synthetic-subject",
	userId: "imported-stable-id",
};
const registry = {
	version: 1,
	sourceDigest: "0".repeat(64),
	coverageComplete: false,
	identities: [entry],
};
describe("protected subject mapping", () => {
	test("only exact sub selects existing imported ID, coverage incomplete never enrolls", () => {
		expect(resolveSubject(registry, entry.subject, null)).toBe(
			"imported-stable-id",
		);
		expect(() =>
			resolveSubject(registry, "same-email-another-sub", null),
		).toThrow();
		expect(() =>
			resolveSubject(registry, entry.subject, "session-A"),
		).toThrow();
	});
	test("same subject remains stable independent of changed provider email", async () => {
		const p = provider({
			...base,
			email: "changed@example.test",
			email_verified: true,
		});
		const subject = await acceptedSubject(
			p.config,
			new URL(`${redirect}?code=x&state=${tx.state}`),
			tx,
			redirect,
		);
		expect(resolveSubject(registry, subject, entry.userId)).toBe(entry.userId);
	});
	test("duplicate subject or target and untrusted registry fields rejected", () => {
		expect(
			registrySchema.safeParse({
				...registry,
				identities: [entry, { ...entry, userId: "another-id" }],
			}).success,
		).toBe(false);
		expect(
			registrySchema.safeParse({
				...registry,
				identities: [entry, { ...entry, subject: "another-sub" }],
			}).success,
		).toBe(false);
		expect(
			registrySchema.safeParse({ ...registry, email: "untrusted@example.test" })
				.success,
		).toBe(false);
	});
});
test("strict recovery inputs cannot inject target, URL or legacy tokens", () => {
	expect(
		recoveryInput(requestSchema, {
			email: "synthetic@example.test",
			locale: "fr",
		}).valid,
	).toBe(true);
	for (const extra of [
		{ userId: "victim" },
		{ url: "https://attacker.test" },
		{ token: "legacy" },
	])
		expect(
			recoveryInput(requestSchema, {
				email: "synthetic@example.test",
				locale: "fr",
				...extra,
			}).valid,
		).toBe(false);
	expect(
		recoveryInput(resetSchema, {
			password: "long-enough",
			locale: "en",
			userId: "victim",
		}).valid,
	).toBe(false);
	expect(
		recoveryInput(changeSchema, { password: "long-enough", locale: "en" })
			.valid,
	).toBe(false);
});

test("broker never issues for missing/ambiguous/mismatched/disabled/MFA/unavailable targets", async () => {
	const { mappedSession } = await import("../src/lib/oauth-broker-policy");
	let mutations = 0;
	const issue = async (id: string) => {
		mutations++;
		return id;
	};
	for (const [raw, sub, current, target] of [
		[registry, "missing", null, { status: true, mfa: false }],
		[
			{ ...registry, identities: [entry, entry] },
			entry.subject,
			null,
			{ status: true, mfa: false },
		],
		[registry, entry.subject, "session-A", { status: true, mfa: false }],
		[registry, entry.subject, null, { status: false, mfa: false }],
		[registry, entry.subject, null, { status: true, mfa: true }],
	] as const)
		await expect(
			mappedSession(raw, sub, current, { target: async () => target, issue }),
		).rejects.toThrow();
	await expect(
		mappedSession(registry, entry.subject, null, {
			target: async () => {
				throw new Error("Missing target");
			},
			issue,
		}),
	).rejects.toThrow();
	expect(mutations).toBe(0);
	expect(
		await mappedSession(registry, entry.subject, null, {
			target: async () => ({ status: true, mfa: false }),
			issue,
		}),
	).toBe("imported-stable-id");
	expect(mutations).toBe(1);
});
test("post-issuance rechecks compensate stale/disabled/MFA/wrong/expired sessions before publication", async () => {
	const { confirmBrokerSession } = await import("../src/lib/oauth-confirm");
	const issued = {
		$id: "session",
		userId: "imported",
		secret: "synthetic-secret",
		expire: new Date(Date.now() + 60_000).toISOString(),
	};
	const user = { $id: "imported", status: true, mfa: false };
	let revocations = 0;
	const baseChecks = {
		account: async () => user,
		target: async () => user,
		session: async () => issued,
		revoke: async () => {
			revocations++;
		},
	};
	expect(await confirmBrokerSession("imported", issued, baseChecks)).toBe(
		issued,
	);
	for (const checks of [
		{ ...baseChecks, target: async () => ({ ...user, status: false }) },
		{ ...baseChecks, target: async () => ({ ...user, mfa: true }) },
		{ ...baseChecks, account: async () => ({ ...user, $id: "wrong" }) },
		{
			...baseChecks,
			session: async () => ({ ...issued, expire: new Date(0).toISOString() }),
		},
		{
			...baseChecks,
			account: async () => {
				throw new Error("Backend unavailable");
			},
		},
	])
		await expect(
			confirmBrokerSession("imported", issued, checks),
		).rejects.toThrow();
	expect(revocations).toBe(5);
});
