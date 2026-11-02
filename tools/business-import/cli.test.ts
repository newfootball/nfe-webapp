import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicPrivate, digest, fresh } from "../identity-import/checkpoint";
import type { SourceUser } from "../identity-import/source";
import type { AppwriteTarget } from "../identity-import/target";
import {
	mayApply,
	parseArgs,
	preflightIdentities,
	reportExitCode,
	validateInputs,
} from "./cli";
import type { BusinessSource } from "./source";

const required = [
	"--source",
	"/source",
	"--identity",
	"/identity",
	"--admin-policy",
	"/policy",
	"--config",
	"/config",
	"--directory",
	"/private",
	"--source-authorized",
];
test("requires authorization and consistent modes", () => {
	expect(parseArgs(required).apply).toBe(false);
	expect(() => parseArgs(required.slice(0, -1))).toThrow("invalid_arguments");
	expect(() => parseArgs([...required, "--apply", "--offline"])).toThrow(
		"invalid_arguments",
	);
	expect(() => parseArgs([...required, "--apply", "--rebuild"])).toThrow(
		"invalid_arguments",
	);
});
test("mismatched identities fail before orchestration", () => {
	const source = {
		User: [
			{ id: "a", email: "a@example.test", role: "USER", emailVerified: true },
		],
	} as BusinessSource;
	const users: SourceUser[] = [
		{
			id: "a",
			email: "other@example.test",
			role: "USER",
			emailVerified: true,
			legacyPassword: null,
			accounts: [],
		},
	];
	expect(() => validateInputs(source, users, [])).toThrow(
		"identity_source_mismatch",
	);
});
test("quarantine, offline and deferred identities block apply", () => {
	expect(mayApply(true, false, 1, 0)).toBe(false);
	expect(mayApply(true, true, 0, 0)).toBe(false);
	expect(mayApply(true, false, 0, 1)).toBe(false);
	expect(mayApply(true, false, 0, 0)).toBe(true);
});

test("reports pending or blocked imports with exit code 2", () => {
	expect(
		reportExitCode({
			media: { quarantined: 1, pending: 0 },
			identity: { deferred: 0 },
		}),
	).toBe(2);
	expect(
		reportExitCode({
			media: { quarantined: 0, pending: 1 },
			identity: { deferred: 0 },
		}),
	).toBe(2);
	expect(
		reportExitCode({
			media: { quarantined: 0, pending: 0 },
			identity: { deferred: 1 },
		}),
	).toBe(2);
	expect(
		reportExitCode({
			media: { quarantined: 0, pending: 0 },
			identity: { deferred: 0 },
		}),
	).toBe(0);
});
test("identity preflight rejects changed password, admin label and missing owned user", async () => {
	const directory = await mkdtemp(join(tmpdir(), "preflight-"));
	try {
		const users: SourceUser[] = [
			{
				id: "user",
				email: "Mixed@example.test",
				role: "USER",
				emailVerified: true,
				legacyPassword: null,
				accounts: [],
			},
		];
		const cp = fresh();
		const binding = "isolated";
		cp.binding = digest(cp.key, {
			users,
			admins: [],
			target: binding,
			preservePasswordless: true,
			normalizeEmails: true,
		});
		const marker = digest(cp.key, { binding: cp.binding, id: "user" });
		cp.entries[digest(cp.key, "user")] = "done";
		const path = join(directory, "checkpoint.json");
		await atomicPrivate(path, cp);
		let current: {
			id: string;
			email: string;
			password: string;
			labels: string[];
			marker: string;
			verified: boolean;
		} | null = {
			id: "user",
			email: "mixed@example.test",
			password: "",
			labels: [],
			marker,
			verified: true,
		};
		const target = {
			users: {
				list: async () => ({
					users: current
						? [
								{
									$id: current.id,
									email: current.email,
									prefs: { nfeIdentityImport: current.marker },
								},
							]
						: [],
					total: current ? 1 : 0,
				}),
			},
			get: async () => current,
			byEmail: async () => (current ? [current] : []),
		} as unknown as AppwriteTarget;
		await preflightIdentities(target, users, [], path, binding);
		current.password = "changed";
		await expect(
			preflightIdentities(target, users, [], path, binding),
		).rejects.toThrow("identity_preflight_incomplete");
		current.password = "";
		current.labels = ["admin"];
		await expect(
			preflightIdentities(target, users, [], path, binding),
		).rejects.toThrow("identity_preflight_incomplete");
		current = null;
		await expect(
			preflightIdentities(target, users, [], path, binding),
		).rejects.toThrow("identity_preflight_incomplete");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("development exception requires an explicit valid flag and complete derived media", () => {
	expect(
		parseArgs([...required, "--allow-missing-media-in-development"])
			.allowMissingMediaInDevelopment,
	).toBe(true);
	expect(() =>
		parseArgs([
			...required,
			"--allow-missing-media-in-development",
			"--allow-missing-media-in-development",
		]),
	).toThrow("invalid_arguments");
	expect(() => parseArgs([...required, "--allow-missing-media"])).toThrow(
		"invalid_arguments",
	);
	expect(mayApply(true, false, 1, 0, true, false)).toBe(false);
	expect(mayApply(true, false, 1, 0, true, true)).toBe(true);
	expect(mayApply(true, true, 1, 0, true, true)).toBe(false);
	expect(
		reportExitCode({
			media: { quarantined: 1, pending: 0 },
			identity: { deferred: 0 },
			acceptedMissing: true,
		}),
	).toBe(0);
	expect(
		reportExitCode({
			media: { quarantined: 1, pending: 1 },
			identity: { deferred: 0 },
			acceptedMissing: true,
		}),
	).toBe(2);
});
