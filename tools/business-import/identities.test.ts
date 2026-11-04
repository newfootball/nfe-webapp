import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	atomicPrivate,
	digest,
	fresh,
	load,
} from "../identity-import/checkpoint";
import type { TargetUser } from "../identity-import/importer";
import type { SourceUser } from "../identity-import/source";
import type { AppwriteTarget } from "../identity-import/target";
import { preflightIdentities, rebaseIdentities } from "./identities";

const user = (id: string, email = `${id}@example.test`): SourceUser => ({
	id,
	email,
	role: "USER",
	emailVerified: true,
	legacyPassword: null,
	accounts: [],
});
class FakeIdentityTarget {
	rows = new Map<string, TargetUser>();
	failMark = false;
	users = {
		list: async () => ({
			users: [...this.rows.values()].map((u) => ({
				$id: u.id,
				email: u.email,
				prefs: { nfeIdentityImport: u.marker },
			})),
			total: this.rows.size,
		}),
	};
	async get(id: string) {
		return this.rows.get(id) ?? null;
	}
	async byEmail(email: string) {
		return [...this.rows.values()].filter((u) => u.email === email);
	}
	async create() {
		throw new Error("unexpected_create");
	}
	async mark(id: string, marker: string) {
		if (this.failMark) throw new Error("crash");
		this.rows.get(id)!.marker = marker;
	}
	async verify() {}
	async admin() {}
	async delete(id: string) {
		this.rows.delete(id);
	}
}
async function imported(
	directory: string,
	users: SourceUser[],
	binding: string,
) {
	const cp = fresh();
	cp.binding = digest(cp.key, {
		users,
		admins: [],
		target: binding,
		preservePasswordless: true,
		normalizeEmails: true,
	});
	const target = new FakeIdentityTarget();
	for (const u of users) {
		cp.entries[digest(cp.key, u.id)] = "done";
		target.rows.set(u.id, {
			id: u.id,
			email: u.email!.toLowerCase(),
			password: "",
			labels: [],
			verified: true,
			marker: digest(cp.key, { binding: cp.binding, id: u.id }),
		});
	}
	const path = join(directory, "identity-checkpoint.json");
	await atomicPrivate(path, cp);
	return { target: target as unknown as AppwriteTarget, fake: target, path };
}
async function withDirectory(run: (directory: string) => Promise<void>) {
	const directory = await mkdtemp(join(tmpdir(), "identities-"));
	try {
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
test("identity preflight rejects changed password, admin label and missing owned user", () =>
	withDirectory(async (directory) => {
		const users = [user("user", "Mixed@example.test")];
		const { target, fake, path } = await imported(directory, users, "isolated");
		await preflightIdentities(target, users, [], path, "isolated");
		const current = fake.rows.get("user")!;
		current.password = "changed";
		await expect(
			preflightIdentities(target, users, [], path, "isolated"),
		).rejects.toThrow("identity_preflight_incomplete");
		current.password = "";
		current.labels = ["admin"];
		await expect(
			preflightIdentities(target, users, [], path, "isolated"),
		).rejects.toThrow("identity_preflight_incomplete");
		fake.rows.clear();
		await expect(
			preflightIdentities(target, users, [], path, "isolated"),
		).rejects.toThrow("identity_preflight_incomplete");
	}));
test("a changed source needs the rebuild flag; rebuild deletes owned identities and rebases markers", () =>
	withDirectory(async (directory) => {
		const before = [user("a"), user("b")];
		const { target, fake, path } = await imported(
			directory,
			before,
			"isolated",
		);
		const after = [user("a")];
		await expect(
			preflightIdentities(target, after, [], path, "isolated"),
		).rejects.toThrow("identity_checkpoint_binding_mismatch");
		expect(
			await preflightIdentities(target, after, [], path, "isolated", true),
		).toEqual({ rebase: true });
		expect(
			await rebaseIdentities({
				target,
				users: after,
				admins: [],
				path,
				binding: "isolated",
			}),
		).toEqual({ remarked: 1, deleted: 1 });
		expect(fake.rows.has("b")).toBe(false);
		const cp = await load(path);
		expect(Object.keys(cp.entries)).toEqual([digest(cp.key, "a")]);
		expect(fake.rows.get("a")?.marker).toBe(
			digest(cp.key, { binding: cp.binding, id: "a" }),
		);
		expect(
			await preflightIdentities(target, after, [], path, "isolated"),
		).toEqual({ rebase: false });
		expect(
			await rebaseIdentities({
				target,
				users: after,
				admins: [],
				path,
				binding: "isolated",
			}),
		).toEqual({ remarked: 0, deleted: 0 });
	}));
test("rebuild never adopts or deletes identities the importer does not own", () =>
	withDirectory(async (directory) => {
		const before = [user("a"), user("b")];
		const { target, fake, path } = await imported(
			directory,
			before,
			"isolated",
		);
		fake.rows.set("c", {
			id: "c",
			email: "c@example.test",
			password: "",
			labels: [],
			verified: true,
		});
		const after = [user("a")];
		await expect(
			preflightIdentities(target, after, [], path, "isolated", true),
		).rejects.toThrow("foreign_target_identity");
		await expect(
			rebaseIdentities({
				target,
				users: after,
				admins: [],
				path,
				binding: "isolated",
			}),
		).rejects.toThrow("foreign_target_identity");
		expect(fake.rows.has("b")).toBe(true);
		fake.rows.delete("c");
		fake.rows.get("b")!.marker = "tampered";
		await expect(
			rebaseIdentities({
				target,
				users: after,
				admins: [],
				path,
				binding: "isolated",
			}),
		).rejects.toThrow("foreign_target_identity");
		expect(fake.rows.has("b")).toBe(true);
	}));
test("an interrupted rebase resumes without repeating deletions", () =>
	withDirectory(async (directory) => {
		const before = [user("b"), user("a")];
		const { target, fake, path } = await imported(
			directory,
			before,
			"isolated",
		);
		const after = [user("a")];
		fake.failMark = true;
		await expect(
			rebaseIdentities({
				target,
				users: after,
				admins: [],
				path,
				binding: "isolated",
			}),
		).rejects.toThrow("crash");
		expect(fake.rows.has("b")).toBe(false);
		expect((await load(path)).binding).not.toBe("");
		fake.failMark = false;
		expect(
			await preflightIdentities(target, after, [], path, "isolated", true),
		).toEqual({ rebase: true });
		expect(
			await rebaseIdentities({
				target,
				users: after,
				admins: [],
				path,
				binding: "isolated",
			}),
		).toEqual({ remarked: 1, deleted: 0 });
		expect(
			await preflightIdentities(target, after, [], path, "isolated"),
		).toEqual({ rebase: false });
	}));
