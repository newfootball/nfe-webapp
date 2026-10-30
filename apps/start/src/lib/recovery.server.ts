import "@tanstack/react-start/server-only";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { Account } from "node-appwrite";
import {
	AuthFailure,
	boundary,
	client,
	configuration,
	identity,
	mutation,
} from "./auth-context.server";
import {
	consumeState,
	limit,
	randomSecret,
	requestLimit,
	saveState,
} from "./oauth-state.server";
import { challengeSchema } from "./recovery-input";

type Input<T> = { valid: true; data: T } | { valid: false };
const challengeCookie = (secure: boolean) =>
	secure ? "__Host-nfe-challenge" : "nfe-challenge-dev";
function invalidationPolicy() {
	// Operator attestation must be backed by the deployment's A/B invalidation proof.
	if (process.env.START_RECOVERY_INVALIDATION_CONFIRMED !== "2.6.2")
		throw new AuthFailure("unavailable");
}
export function requestRecovery(
	input: Input<{ email: string; locale: "fr" | "en" }>,
) {
	return boundary(async () => {
		const config = mutation();
		invalidationPolicy();
		if (!input.valid) throw new AuthFailure("invalid");
		// All account outcomes use the same response and minimum response duration.
		// The public no-key endpoint keeps Appwrite's own abuse limits in force.
		const started = Date.now();
		try {
			await requestLimit("recovery", input.data.email.trim().toLowerCase());
			await new Account(
				client(config).setLocale(input.data.locale),
			).createRecovery({
				email: input.data.email,
				url: `${config.origin}/recovery/callback?kind=reset&locale=${input.data.locale}`,
			});
		} catch {
			/* Account absence, disabled account, SMTP and abuse outcomes are private. */
		}
		await new Promise((resolve) =>
			setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))),
		);
		return { requested: true as const };
	});
}
export async function captureChallenge(url: URL) {
	const config = configuration();
	const input = challengeSchema.parse(
		Object.fromEntries(
			["userId", "secret", "kind", "locale"].map((key) => [
				key,
				url.searchParams.get(key),
			]),
		),
	);
	await limit("challenge-capture", "all", 100, 60);
	const handle = randomSecret();
	await saveState("challenge", handle, input, 3600);
	setCookie(challengeCookie(config.cookie.options.secure), handle, {
		...config.cookie.options,
		maxAge: 3600,
	});
	return `/${input.locale}/recovery?flow=${input.kind}`;
}
export function finishChallenge(
	input: Input<{ password?: string; locale: "fr" | "en" }>,
	kind: "reset" | "verify",
) {
	return boundary(async () => {
		const config = mutation();
		if (!input.valid) throw new AuthFailure("invalid");
		if (kind === "reset") invalidationPolicy();
		await limit("challenge-finish", "all", 100, 60);
		const cookie = challengeCookie(config.cookie.options.secure);
		const handle = getCookie(cookie);
		deleteCookie(cookie, config.cookie.options);
		if (!handle) throw new AuthFailure("invalid");
		const challenge = challengeSchema.safeParse(
			await consumeState("challenge", handle),
		);
		if (
			!challenge.success ||
			challenge.data.kind !== kind ||
			challenge.data.locale !== input.data.locale
		)
			throw new AuthFailure("invalid");
		const account = new Account(client(config));
		try {
			const { userId, secret } = challenge.data;
			if (kind === "reset" && input.data.password)
				await account.updateRecovery({
					userId,
					secret,
					password: input.data.password,
				});
			else if (kind === "verify")
				await account.updateEmailVerification({ userId, secret });
			else throw new AuthFailure("invalid");
		} catch {
			throw new AuthFailure("invalid");
		}
		if (kind === "reset")
			deleteCookie(config.cookie.name, config.cookie.options);
		return { updated: true as const };
	});
}
export function changePassword(
	input: Input<{ oldPassword: string; password: string; locale: "fr" | "en" }>,
) {
	return boundary(async () => {
		mutation();
		invalidationPolicy();
		if (!input.valid) throw new AuthFailure("invalid");
		const { account, user } = await identity();
		await requestLimit("password-change", user.$id);
		// Appwrite allows adding a first password with a session alone. This wrapper does not.
		if (!user.passwordUpdate) throw new AuthFailure("credentials");
		try {
			const currentSession = await account.getSession({ sessionId: "current" });
			await account.updatePassword({
				password: input.data.password,
				oldPassword: input.data.oldPassword,
			});
			const sessions = await account.listSessions();
			for (const session of sessions.sessions)
				if (session.$id !== currentSession.$id)
					await account.deleteSession({ sessionId: session.$id });
		} catch {
			throw new AuthFailure("credentials");
		}
		return { updated: true as const };
	});
}
export function requestVerification(input: Input<{ locale: "fr" | "en" }>) {
	return boundary(async () => {
		const config = mutation();
		if (!input.valid) throw new AuthFailure("invalid");
		const { sessionClient, user } = await identity();
		await requestLimit("verify", user.$id);
		try {
			await new Account(
				sessionClient.setLocale(input.data.locale),
			).createEmailVerification({
				url: `${config.origin}/recovery/callback?kind=verify&locale=${input.data.locale}`,
			});
		} catch {
			/* Do not serialize delivery credentials or backend errors. */
		}
		return { requested: true as const };
	});
}
export function verificationStatus() {
	return boundary(async () => {
		const { user } = await identity();
		return {
			email: user.email,
			verified: user.emailVerification,
			hasPassword: Boolean(user.passwordUpdate),
		};
	});
}
