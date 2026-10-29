import "@tanstack/react-start/server-only";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { Account, Users } from "node-appwrite";
import * as oidc from "openid-client";
import { z } from "zod";
import { client, configuration, identity } from "./auth-context.server";
import { mappedSession } from "./oauth-broker-policy";
import { confirmBrokerSession } from "./oauth-confirm";
import { acceptedSubject, googleConfiguration } from "./oauth-protocol";
import { resolveSubject } from "./oauth-registry";
import { privateRegistry } from "./oauth-registry.server";
import {
	consumeState,
	digest,
	randomSecret,
	requestLimit,
	saveState,
} from "./oauth-state.server";

const transactionSchema = z.strictObject({
	state: z.string(),
	nonce: z.string(),
	verifier: z.string(),
	binding: z.string(),
	session: z.string(),
	currentId: z.string().nullable(),
	locale: z.enum(["fr", "en"]),
});
function settings() {
	const base = configuration();
	const id = process.env.START_GOOGLE_CLIENT_ID;
	const secret = process.env.START_GOOGLE_CLIENT_SECRET;
	const brokerKey = process.env.START_OAUTH_BROKER_KEY;
	if (
		process.env.START_GOOGLE_ENABLED !== "true" ||
		!id ||
		!secret ||
		!brokerKey ||
		brokerKey === base.key
	)
		throw new Error("OAuth unavailable");
	return {
		...base,
		brokerKey,
		oidc: googleConfiguration(id, secret),
		callback: `${base.origin}/oauth/callback`,
	};
}
const cookieName = (secure: boolean) =>
	secure ? "__Host-nfe-oidc" : "nfe-oidc-dev";
export async function beginGoogle(locale: "fr" | "en") {
	const config = settings();
	await privateRegistry();
	await requestLimit("oauth-start", "all");
	const current = getCookie(config.cookie.name);
	const currentId = current ? (await identity()).viewer.id : null;
	const state = oidc.randomState();
	const nonce = oidc.randomNonce();
	const verifier = oidc.randomPKCECodeVerifier();
	const binding = randomSecret();
	await saveState(
		"oidc",
		state,
		{
			state,
			nonce,
			verifier,
			binding: digest(binding),
			session: digest(current ?? ""),
			currentId,
			locale,
		},
		300,
	);
	setCookie(cookieName(config.cookie.options.secure), binding, {
		...config.cookie.options,
		maxAge: 300,
	});
	return oidc.buildAuthorizationUrl(config.oidc, {
		redirect_uri: config.callback,
		response_type: "code",
		scope: "openid email",
		state,
		nonce,
		code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
		code_challenge_method: "S256",
	}).href;
}
export async function completeGoogle(url: URL) {
	const config = settings();
	const binding = getCookie(cookieName(config.cookie.options.secure));
	deleteCookie(cookieName(config.cookie.options.secure), config.cookie.options);
	const state = url.searchParams.get("state");
	if (!binding || !state || state.length > 256)
		throw new Error("OAuth unavailable");
	const tx = transactionSchema.parse(await consumeState("oidc", state));
	try {
		const session = getCookie(config.cookie.name);
		if (tx.binding !== digest(binding) || tx.session !== digest(session ?? ""))
			throw new Error("OAuth unavailable");
		if (session && (await identity()).viewer.id !== tx.currentId)
			throw new Error("OAuth unavailable");
		const subject = await acceptedSubject(
			config.oidc,
			url,
			tx,
			config.callback,
		);
		// Isolated broker authority: users.read + sessions.write, never users.write.
		const users = new Users(client(config).setKey(config.brokerKey));
		const registry = await privateRegistry();
		const expectedId = resolveSubject(registry, subject, tx.currentId);
		const issued = await mappedSession(registry, subject, tx.currentId, {
			target: (userId) => users.get({ userId }),
			issue: (userId) => users.createSession({ userId }),
		});
		const issuedAccount = new Account(client(config).setSession(issued.secret));
		await confirmBrokerSession(expectedId, issued, {
			account: () => issuedAccount.get(),
			target: () => users.get({ userId: expectedId }),
			session: () => issuedAccount.getSession({ sessionId: "current" }),
			revoke: () =>
				users.deleteSession({ userId: expectedId, sessionId: issued.$id }),
		});
		try {
			if (session)
				await new Account(client(config).setSession(session)).deleteSession({
					sessionId: "current",
				});
		} catch {
			await users.deleteSession({ userId: expectedId, sessionId: issued.$id });
			throw new Error("Session unavailable");
		}
		setCookie(config.cookie.name, issued.secret, {
			...config.cookie.options,
			expires: new Date(issued.expire),
		});
		return `/${tx.locale}/private`;
	} catch {
		return `/${tx.locale}/sign-in?oauth=failed`;
	}
}
