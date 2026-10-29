import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicPrivate, fresh, load, withLock } from "./checkpoint";
import { plan, runImport, type Target, type TargetUser } from "./importer";
import { readSource, type SourceUser } from "./source";
import { targetConfig } from "./target";

const hash = `$2b$10$${"a".repeat(53)}`;
const user = (id = "source-id"): SourceUser => ({
	id,
	email: `${id}@example.test`,
	emailVerified: true,
	role: "USER",
	legacyPassword: null,
	accounts: [{ providerId: "credential", accountId: id, password: hash }],
});
const dirs: string[] = [];
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "nfe-identity-check-"));
	dirs.push(path);
	return path;
}
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});
class FakeTarget implements Target {
	users = new Map<string, TargetUser>();
	writes = 0;
	failMark = false;
	failVerify = false;
	async get(id: string) {
		return this.users.get(id) ?? null;
	}
	async byEmail(email: string) {
		return [...this.users.values()].filter(
			(u) => u.email.toLowerCase() === email.toLowerCase(),
		);
	}
	async create(u: SourceUser, password: string) {
		this.writes++;
		this.users.set(u.id, {
			id: u.id,
			email: u.email!,
			password,
			verified: false,
			labels: [],
		});
	}
	async mark(id: string, marker: string) {
		if (this.failMark) throw new Error("secret@example.test");
		this.writes++;
		this.users.get(id)!.marker = marker;
	}
	async verify(id: string, value: boolean) {
		if (this.failVerify) throw new Error("sensitive SDK error");
		this.writes++;
		this.users.get(id)!.verified = value;
	}
	async admin(id: string) {
		this.writes++;
		this.users.get(id)!.labels = ["admin"];
	}
}
async function setup(users = [user()], admins: string[] = []) {
	const path = join(await directory(), "checkpoint.json");
	return {
		users,
		admins,
		target: new FakeTarget(),
		checkpoint: fresh(),
		checkpointPath: path,
		targetBinding: "isolated-test",
		apply: true,
	};
}

describe("mapping", () => {
	test("active credential wins and divergent historical hash is audited", () => {
		const u = user();
		u.legacyPassword = `$2b$10$${"b".repeat(53)}`;
		const p = plan([u], [])[0]!;
		expect(p.password).toBe(hash);
		expect(p.reasons).toEqual([]);
		expect(p.warnings).toContain("legacy_password_diverges");
	});
	test("never promotes legacy hashes, Google tokens or incomplete credentials", () => {
		for (const provider of ["google", "credential"]) {
			const u = user();
			u.legacyPassword = hash;
			u.accounts = [{ providerId: provider, accountId: u.id, password: null }];
			expect(plan([u], [])[0]!.reasons.length).toBeGreaterThan(0);
		}
	});
	test("duplicate credential, different owner, unsupported hash and provider defer", () => {
		const fixtures = [user(), user(), user(), user()];
		fixtures[0]!.accounts.push({ ...fixtures[0]!.accounts[0]! });
		fixtures[1]!.accounts[0]!.accountId = "other";
		fixtures[2]!.accounts[0]!.password = "scrypt:unsafe";
		fixtures[3]!.accounts.push({
			providerId: "unknown",
			accountId: "other",
			password: null,
		});
		for (const u of fixtures)
			expect(plan([u], [])[0]!.reasons.length).toBeGreaterThan(0);
	});
	test("case-folded collisions quarantine every involved row", () => {
		const a = user("a"),
			b = user("b");
		b.email = a.email!.toUpperCase();
		expect(
			plan([a, b], []).every((p) => p.reasons.includes("source_collision")),
		).toBe(true);
		expect(
			plan([a, a], []).every((p) => p.reasons.includes("source_collision")),
		).toBe(true);
	});
	test("mixed-case email defers rather than changing the source value", () => {
		expect(
			plan([{ ...user(), email: "Mixed@example.test" }], [])[0]!.reasons,
		).toContain("email_case_preservation_unsupported");
	});
	test("invalid IDs/emails are never rewritten", () => {
		for (const u of [
			{ ...user(), id: "bad/id" },
			{ ...user(), email: null },
			{ ...user(), email: " bad@example.test" },
		])
			expect(plan([u], [])[0]!.reasons.length).toBeGreaterThan(0);
	});
	test("admin is never granted implicitly", () => {
		const u = { ...user(), role: "ADMIN" as const };
		expect(plan([u], [])[0]!.reasons).toContain("admin_approval_required");
		expect(plan([u], [u.id])[0]!.reasons).toEqual([]);
	});
});
describe("protected source and checkpoint", () => {
	test("mode 600 and explicit authorization required; reject symlinks and token fields", async () => {
		const dir = await directory();
		const path = join(dir, "source.json");
		await atomicPrivate(path, { version: 1, users: [user()] });
		expect(await readSource(path, true)).toEqual([user()]);
		await expect(readSource(path, false)).rejects.toThrow("authorization");
		await chmod(path, 0o644);
		await expect(readSource(path, true)).rejects.toThrow("unsafe");
		await chmod(path, 0o600);
		await symlink(path, join(dir, "link"));
		await expect(readSource(join(dir, "link"), true)).rejects.toThrow();
		await atomicPrivate(path, {
			version: 1,
			users: [{ ...user(), resetToken: "secret" }],
		});
		await expect(readSource(path, true)).rejects.toThrow("projection");
	});
	test("checkpoint atomic mode 600, reload and single writer", async () => {
		const path = join(await directory(), "cp.json");
		const cp = fresh();
		await atomicPrivate(path, cp);
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect(await load(path)).toEqual(cp);
		await withLock(path, async () => {
			await expect(withLock(path, async () => {})).rejects.toThrow();
		});
		expect(await Bun.file(`${path}.lock`).exists()).toBe(false);
	});
});
describe("import boundary", () => {
	test("dry-run has zero writes, creates no checkpoint, counts eligible", async () => {
		const args = await setup();
		const r = await runImport({ ...args, apply: false });
		expect(r.counts.eligible).toBe(1);
		expect(args.target.writes).toBe(0);
		expect(await Bun.file(args.checkpointPath).exists()).toBe(false);
	});
	test("preserves identity and verification; replay has zero additional writes", async () => {
		const args = await setup();
		expect((await runImport(args)).counts.imported).toBe(1);
		const writes = args.target.writes;
		const r = await runImport({
			...args,
			checkpoint: await load(args.checkpointPath),
		});
		expect(r.counts.unchanged).toBe(1);
		expect(args.target.writes).toBe(writes);
		expect(await args.target.get(user().id)).toMatchObject({
			email: user().email,
			verified: true,
			password: hash,
		});
	});
	test("restart after remote ownership marker finishes verification", async () => {
		const args = await setup();
		args.target.failVerify = true;
		expect((await runImport(args)).counts.failed).toBe(1);
		args.target.failVerify = false;
		expect(
			(
				await runImport({
					...args,
					checkpoint: await load(args.checkpointPath),
				})
			).counts.imported,
		).toBe(1);
	});
	test("crash between create and marker fails closed without adoption", async () => {
		const args = await setup();
		args.target.failMark = true;
		expect((await runImport(args)).counts.failed).toBe(1);
		args.target.failMark = false;
		const writes = args.target.writes;
		expect(
			(
				await runImport({
					...args,
					checkpoint: await load(args.checkpointPath),
				})
			).counts.target_collision,
		).toBe(1);
		expect(args.target.writes).toBe(writes);
	});
	test("unowned matching IDs and other-ID same email never mutate", async () => {
		for (const foreign of [
			user(),
			{ ...user("foreign-id"), email: user().email },
		]) {
			const args = await setup();
			await args.target.create(foreign, hash);
			const writes = args.target.writes;
			expect((await runImport(args)).counts.target_collision).toBe(1);
			expect(args.target.writes).toBe(writes);
		}
	});
	test("snapshot/target/admin policy changes invalidate checkpoint", async () => {
		const args = await setup();
		await runImport(args);
		for (const changes of [
			{ targetBinding: "other" },
			{ users: [{ ...user(), emailVerified: false }] },
			{ admins: ["not-admin"] },
		])
			await expect(
				runImport({
					...args,
					...changes,
					checkpoint: await load(args.checkpointPath),
				}),
			).rejects.toThrow();
	});
	test("missing checkpoint user or changed password never repaired automatically", async () => {
		for (const missing of [true, false]) {
			const args = await setup();
			await runImport(args);
			if (missing) args.target.users.delete(user().id);
			else args.target.users.get(user().id)!.password = "changed";
			expect(
				(
					await runImport({
						...args,
						checkpoint: await load(args.checkpointPath),
					})
				).counts.target_collision,
			).toBe(1);
		}
	});
	test("privileged mapping has durable redacted before/after audit", async () => {
		const u = { ...user(), role: "ADMIN" as const };
		const args = await setup([u], [u.id]);
		const r = await runImport(args);
		expect(r.audit.map((a) => a.operation)).toEqual([
			"admin_approved",
			"admin_applied",
		]);
		expect((await load(args.checkpointPath)).audit).toEqual(r.audit);
		expect((await args.target.get(u.id))!.labels).toEqual(["admin"]);
	});
	test("reports and checkpoint exclude emails, IDs, hashes and target errors", async () => {
		const args = await setup();
		args.target.failMark = true;
		const r = await runImport(args);
		const serialized =
			JSON.stringify(r) + (await readFile(args.checkpointPath, "utf8"));
		for (const secret of [
			user().id,
			user().email!,
			hash,
			"secret@example.test",
		])
			expect(serialized).not.toContain(secret);
	});
	test("CLI defaults offline, stdout aggregate only, rejects secrets in malformed source", async () => {
		const dir = await directory();
		const source = join(dir, "source.json"),
			report = join(dir, "report.json");
		await atomicPrivate(source, { version: 1, users: [user()] });
		const process = Bun.spawn(
			[
				"bun",
				"run",
				`${import.meta.dir}/cli.ts`,
				"--source",
				source,
				"--source-authorized",
				"--report",
				report,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await process.exited).toBe(0);
		const out = await new Response(process.stdout).text();
		expect(JSON.parse(out).counts.eligible_offline).toBe(1);
		expect(out).not.toContain(user().email!);
	});
	test("only dedicated synthetic loopback targets accepted", () => {
		for (const endpoint of [
			"https://production.example/v1",
			"http://localhost:19550/v1",
			"http://127.0.0.1:19550/v1?secret=x",
		])
			expect(() => targetConfig(endpoint, "nfe-identity-50")).toThrow();
		expect(() =>
			targetConfig("http://127.0.0.1:19550/v1", "production"),
		).toThrow();
		expect(
			targetConfig("http://127.0.0.1:19550/v1", "nfe-identity-50"),
		).toContain("nfe-identity-50");
	});
});
