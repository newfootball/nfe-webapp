import "@tanstack/react-start/server-only";
import {
	deleteCookie,
	getCookie,
	getRequest,
	setResponseHeader,
} from "@tanstack/react-start/server";
import { Account, AppwriteException, Client } from "node-appwrite";
import { isTrustedMutation, sessionCookiePolicy } from "./auth-policy";

export type AuthError =
	| "credentials"
	| "unauthorized"
	| "forbidden"
	| "unavailable"
	| "origin"
	| "invalid";
export type Viewer = { id: string; name: string; role: "member" | "admin" };
export type AuthResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: AuthError };
export class AuthFailure extends Error {
	constructor(readonly reason: AuthError) {
		super("Authentication request failed");
	}
}
export function configuration() {
	const origin = process.env.START_APP_ORIGIN;
	const endpoint = process.env.START_APPWRITE_ENDPOINT;
	const project = process.env.START_APPWRITE_PROJECT;
	const key = process.env.START_APPWRITE_SESSION_KEY;
	if (!origin || !endpoint || !project || !key)
		throw new AuthFailure("unavailable");
	const cookie = sessionCookiePolicy(
		origin,
		process.env.START_AUTH_ALLOW_HTTP_LOOPBACK === "true",
	);
	const backend = new URL(endpoint);
	if (
		backend.protocol !== "https:" &&
		!(
			process.env.START_AUTH_ALLOW_HTTP_LOOPBACK === "true" &&
			backend.protocol === "http:" &&
			["127.0.0.1", "localhost"].includes(backend.hostname)
		)
	)
		throw new AuthFailure("unavailable");
	return { origin, endpoint, project, key, cookie };
}
export function privateResponse() {
	setResponseHeader("Cache-Control", "private, no-store");
	setResponseHeader("Vary", "Cookie");
}
export function client(config: ReturnType<typeof configuration>) {
	// Never store a mutable client in module scope or use an admin client for private data.
	return new Client().setEndpoint(config.endpoint).setProject(config.project);
}
export async function boundary<T>(
	run: () => Promise<T>,
): Promise<AuthResult<T>> {
	privateResponse();
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		if (error instanceof AuthFailure) return { ok: false, error: error.reason };
		// Do not serialize SDK errors, response bodies, credentials or configuration.
		return { ok: false, error: "unavailable" };
	}
}
export function mutation() {
	const config = configuration();
	if (!isTrustedMutation(getRequest(), config.origin))
		throw new AuthFailure("origin");
	return config;
}
export async function identity() {
	const config = configuration();
	const secret = getCookie(config.cookie.name);
	if (!secret) throw new AuthFailure("unauthorized");
	const account = new Account(client(config).setSession(secret));
	try {
		const user = await account.get();
		if (!user.status) throw new AuthFailure("unauthorized");
		const session = await account.getSession({ sessionId: "current" });
		if (Date.parse(session.expire) <= Date.now())
			throw new AuthFailure("unauthorized");
		const viewer: Viewer = {
			id: user.$id,
			name: user.name,
			role: user.labels.includes("admin") ? "admin" : "member",
		};
		return {
			account,
			viewer,
			user,
			sessionClient: client(config).setSession(secret),
		};
	} catch (error) {
		if (
			error instanceof AuthFailure ||
			(error instanceof AppwriteException &&
				[401, 403, 404].includes(error.code))
		) {
			deleteCookie(config.cookie.name, config.cookie.options);
			throw new AuthFailure("unauthorized");
		}
		throw error;
	}
}
