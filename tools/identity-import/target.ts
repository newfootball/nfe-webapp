import { Client, type Models, Query, Users } from "node-appwrite";
import type { Target, TargetUser } from "./importer";
import type { SourceUser } from "./source";

export function targetConfig(endpoint: string, project: string) {
	const url = new URL(endpoint);
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
		!/^nfe-identity-[a-z0-9-]+$/.test(project)
	)
		throw new Error("synthetic_loopback_target_required");
	return `${url.href}|${project}`;
}
export class AppwriteTarget implements Target {
	readonly users: Users;
	constructor(endpoint: string, project: string, key: string) {
		targetConfig(endpoint, project);
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
	async create(user: SourceUser, password: string) {
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
}
