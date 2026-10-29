import "@tanstack/react-start/server-only";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { Account, AppwriteException, ID, type Models } from "node-appwrite";
import {
	AuthFailure,
	boundary,
	client,
	identity,
	mutation,
} from "./auth-context.server";
import type { AuthInput } from "./auth-input";

export type { AuthError, AuthResult, Viewer } from "./auth-context.server";
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
export function authenticate(
	input: AuthInput<{ email: string; password: string; name?: string }>,
	signup: boolean,
) {
	return boundary(async () => {
		const config = mutation();
		if (!input.valid) throw new AuthFailure("credentials");
		const data = input.data;
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
export function renameSelf(input: AuthInput<{ name: string }>) {
	return boundary(async () => {
		mutation();
		const { account } = await identity();
		if (!input.valid) throw new AuthFailure("invalid");
		await account.updateName({ name: input.data.name });
		return { updated: true as const };
	});
}
