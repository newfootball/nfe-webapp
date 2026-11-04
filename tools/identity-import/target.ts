import { isIP } from "node:net";
import { Client, type Models, Query, Users } from "node-appwrite";
import type { Target, TargetUser } from "./importer";
import type { SourceUser } from "./source";

export type TargetOptions = {
	isolatedBusinessImport?: boolean;
	production?: boolean;
};
// The persistent synthetic local runtime (#64) is the only business target
// outside the disposable nfe-import-63 stacks: fixed loopback port and project.
export const localRehearsalTarget = { port: "18464", project: "nfe-local" };
export function isolatedBusinessProject(url: URL, project: string) {
	return (
		/^nfe-import-63-[a-z0-9-]+$/.test(project) ||
		(project === localRehearsalTarget.project &&
			url.port === localRehearsalTarget.port)
	);
}
// A production endpoint is a named public HTTPS host serving exactly /v1.
// Loopback, raw IPs, local names, ports, credentials and query parts are
// rejected so a misconfigured endpoint cannot pass as the real project.
export function isProductionEndpoint(url: URL, project: string) {
	const host = url.hostname.toLowerCase();
	return (
		url.protocol === "https:" &&
		url.pathname === "/v1" &&
		!url.port &&
		!url.search &&
		!url.hash &&
		!url.username &&
		!url.password &&
		/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
			host,
		) &&
		!isIP(host) &&
		host !== "localhost" &&
		!host.endsWith(".localhost") &&
		!host.endsWith(".local") &&
		/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(project)
	);
}
export function targetConfig(
	endpoint: string,
	project: string,
	options: TargetOptions = {},
) {
	const url = new URL(endpoint);
	if (options.production) {
		if (!isProductionEndpoint(url, project))
			throw new Error("explicit_production_target_required");
		return `${url.href}|${project}|production`;
	}
	// Real/representative imports deliberately gated pending #47/#49.
	if (
		url.protocol !== "http:" ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/v1" ||
		url.search ||
		url.hash ||
		url.username ||
		url.password ||
		!url.port ||
		!(options.isolatedBusinessImport
			? isolatedBusinessProject(url, project)
			: /^nfe-identity-[a-z0-9-]+$/.test(project))
	)
		throw new Error("synthetic_loopback_target_required");
	return `${url.href}|${project}`;
}
export class AppwriteTarget implements Target {
	readonly users: Users;
	constructor(
		endpoint: string,
		project: string,
		key: string,
		options: TargetOptions = {},
	) {
		targetConfig(endpoint, project, options);
		this.users = new Users(
			new Client().setEndpoint(endpoint).setProject(project).setKey(key),
		);
	}
	private map(user: Models.User<{ nfeIdentityImport?: string }>): TargetUser {
		return {
			id: user.$id,
			email: user.email,
			verified: user.emailVerification,
			password: user.password ?? "",
			labels: user.labels,
			marker: user.prefs.nfeIdentityImport,
		};
	}
	async get(id: string) {
		try {
			return this.map(
				await this.users.get<{ nfeIdentityImport?: string }>({ userId: id }),
			);
		} catch (error) {
			if ((error as { code?: number }).code === 404) return null;
			throw error;
		}
	}
	async byEmail(email: string) {
		return (
			await this.users.list<{ nfeIdentityImport?: string }>({
				queries: [Query.equal("email", [email]), Query.limit(2)],
			})
		).users.map((user) => this.map(user));
	}
	async create(user: SourceUser, password: string | null) {
		if (password === null) {
			await this.users.create({ userId: user.id, email: user.email as string });
			return;
		}
		await this.users.createBcryptUser({
			userId: user.id,
			email: user.email as string,
			password,
		});
	}
	async mark(id: string, marker: string) {
		await this.users.updatePrefs({
			userId: id,
			prefs: { nfeIdentityImport: marker },
		});
	}
	async verify(id: string, value: boolean) {
		await this.users.updateEmailVerification({
			userId: id,
			emailVerification: value,
		});
	}
	async admin(id: string) {
		const current = await this.users.get({ userId: id });
		await this.users.updateLabels({
			userId: id,
			labels: [...new Set([...current.labels, "admin"])],
		});
	}
	async delete(id: string) {
		await this.users.delete({ userId: id });
	}
}
