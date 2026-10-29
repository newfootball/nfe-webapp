import "@tanstack/react-start/server-only";
import {
	deleteCookie,
	getCookie,
	getRequest,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";
import {
	Account,
	AppwriteException,
	Client,
	ID,
	type Models,
} from "node-appwrite";
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
class AuthFailure extends Error {
	constructor(readonly reason: AuthError) {
		super("Authentication request failed");
	}
}
function configuration() {
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
function privateResponse() {
	setResponseHeader("Cache-Control", "private, no-store");
	setResponseHeader("Vary", "Cookie");
}
function client(config: ReturnType<typeof configuration>) {
	// Never store a mutable client in module scope or use an admin client for private data.
	return new Client().setEndpoint(config.endpoint).setProject(config.project);
}
async function boundary<T>(run: () => Promise<T>): Promise<AuthResult<T>> {
	privateResponse();
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		if (error instanceof AuthFailure) return { ok: false, error: error.reason };
		// Do not serialize SDK errors, response bodies, credentials or configuration.
		return { ok: false, error: "unavailable" };
	}
}
function mutation() {
	const config = configuration();
	if (!isTrustedMutation(getRequest(), config.origin))
		throw new AuthFailure("origin");
	return config;
}
async function identity() {
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
		return { account, viewer };
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
export function readSession() {
	return boundary(async () => {
		try {
			return (await identity()).viewer;
		} catch (error) {
			if (error instanceof AuthFailure && error.reason === "unauthorized")
				return null;
			throw error;
		}
	});
}
function credentials(data: { email: string; password: string; name?: string }) {
	if (
		typeof data.email !== "string" ||
		data.email.length > 254 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
		typeof data.password !== "string" ||
		data.password.length < 8 ||
		data.password.length > 256 ||
		(data.name !== undefined &&
			(typeof data.name !== "string" ||
				!data.name.trim() ||
				data.name.length > 80))
	)
		throw new AuthFailure("credentials");
}
export function authenticate(
	data: { email: string; password: string; name?: string },
	signup: boolean,
) {
	return boundary(async () => {
		const config = mutation();
		credentials(data);
		// Public signup respects Appwrite account policies. Key scope is sessions.write only.
		if (signup) {
			try {
				await new Account(client(config)).create({
					userId: ID.unique(),
					email: data.email,
					password: data.password,
					name: data.name,
				});
			} catch {
				throw new AuthFailure("credentials");
			}
		}
		let session: Models.Session;
		try {
			session = await new Account(
				client(config).setKey(config.key),
			).createEmailPasswordSession({
				email: data.email,
				password: data.password,
			});
		} catch {
			throw new AuthFailure("credentials");
		}
		if (!session.secret || Date.parse(session.expire) <= Date.now())
			throw new AuthFailure("unavailable");
		// Revoke the previous browser session when switching identity.
		const previous = getCookie(config.cookie.name);
		if (previous) {
			try {
				await new Account(client(config).setSession(previous)).deleteSession({
					sessionId: "current",
				});
			} catch (error) {
				if (
					!(
						error instanceof AppwriteException &&
						[401, 403, 404].includes(error.code)
					)
				) {
					await new Account(
						client(config).setSession(session.secret),
					).deleteSession({ sessionId: "current" });
					throw new AuthFailure("unavailable");
				}
			}
		}
		setCookie(config.cookie.name, session.secret, {
			...config.cookie.options,
			expires: new Date(session.expire),
		});
		return { authenticated: true as const };
	});
}
export function endSession() {
	return boundary(async () => {
		const config = mutation();
		const secret = getCookie(config.cookie.name);
		if (secret) {
			try {
				await new Account(client(config).setSession(secret)).deleteSession({
					sessionId: "current",
				});
			} catch (error) {
				if (
					!(
						error instanceof AppwriteException &&
						[401, 403, 404].includes(error.code)
					)
				)
					throw error;
			}
		}
		deleteCookie(config.cookie.name, config.cookie.options);
		return { authenticated: false as const };
	});
}
export function readPrivate() {
	return boundary(async () => (await identity()).viewer);
}
export function readAdmin() {
	return boundary(async () => {
		const { viewer } = await identity();
		if (viewer.role !== "admin") throw new AuthFailure("forbidden");
		return { id: viewer.id, role: viewer.role };
	});
}
export function renameSelf(name: string) {
	return boundary(async () => {
		mutation();
		const { account } = await identity();
		if (typeof name !== "string" || !name.trim() || name.length > 80)
			throw new AuthFailure("invalid");
		await account.updateName({ name: name.trim() });
		return { updated: true as const };
	});
}
