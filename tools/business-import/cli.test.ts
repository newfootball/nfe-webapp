import { expect, test } from "bun:test";
import type { SourceUser } from "../identity-import/source";
import {
	applyRefusal,
	assertStorageBinding,
	mayApply,
	parseArgs,
	redactReport,
	reportExitCode,
	resolveTarget,
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
	expect(parseArgs(required).acceptedLoss).toBeNull();
	expect(parseArgs(required).productionTarget).toBe(false);
	expect(() => parseArgs(required.slice(0, -1))).toThrow("invalid_arguments");
	expect(() => parseArgs([...required, "--apply", "--offline"])).toThrow(
		"invalid_arguments",
	);
	expect(() => parseArgs([...required, "--apply", "--rebuild"])).toThrow(
		"invalid_arguments",
	);
	expect(() => parseArgs([...required, "--freeze-confirmed"])).toThrow(
		"invalid_arguments",
	);
	expect(
		parseArgs([...required, "--apply", "--rebuild", "--freeze-confirmed"]),
	).toMatchObject({ apply: true, rebuild: true, frozen: true });
	expect(() =>
		parseArgs([...required, "--allow-missing-media-in-development"]),
	).toThrow("invalid_arguments");
});
test("accepted-loss manifest and production target are explicit arguments", () => {
	expect(
		parseArgs([...required, "--accepted-loss", "/private/loss.json"])
			.acceptedLoss,
	).toBe("/private/loss.json");
	expect(() => parseArgs([...required, "--accepted-loss"])).toThrow(
		"invalid_arguments",
	);
	expect(() => parseArgs([...required, "--accepted-loss", "--apply"])).toThrow(
		"invalid_arguments",
	);
	expect(parseArgs([...required, "--production-target"]).productionTarget).toBe(
		true,
	);
	expect(() =>
		parseArgs([...required, "--production-target", "--production-target"]),
	).toThrow("invalid_arguments");
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
test("accepted loss requires a matching manifest and complete derived media", () => {
	const ok = { ok: true, stale: 0 };
	expect(applyRefusal(true, false, 1, 0, ok, false)).toBe("derived_incomplete");
	expect(applyRefusal(true, false, 1, 0, { ok: false, stale: 0 }, true)).toBe(
		"unaccepted_loss",
	);
	expect(applyRefusal(true, false, 0, 0, { ok: false, stale: 1 }, true)).toBe(
		"stale_manifest",
	);
	expect(applyRefusal(true, false, 1, 0, ok, true)).toBeNull();
	expect(applyRefusal(true, true, 1, 0, ok, true)).toBe("offline");
	expect(applyRefusal(false, false, 0, 0)).toBe("dry_run");
	expect(applyRefusal(true, false, 0, 2)).toBe("deferred_identities");
	expect(mayApply(true, false, 1, 0, ok, true)).toBe(true);
});
test("a refused apply never exits 0", () => {
	const ok = {
		media: { quarantined: 0, pending: 0 },
		identity: { deferred: 0 },
	};
	expect(
		reportExitCode({
			...ok,
			mode: "apply",
			applied: false,
			acceptedLoss: { ok: false },
		}),
	).toBe(2);
	expect(
		reportExitCode({
			...ok,
			mode: "apply",
			applied: false,
			media: { quarantined: 1, pending: 0 },
			acceptedLoss: { ok: true },
		}),
	).toBe(2);
	expect(
		reportExitCode({
			...ok,
			mode: "apply",
			applied: true,
			acceptedLoss: { ok: true },
		}),
	).toBe(0);
	expect(reportExitCode({ ...ok, mode: "dry-run", applied: false })).toBe(0);
});
test("a production apply requires the app storage binding", () => {
	const dev = { bucket: "nfe-webapp-dev", prefix: "nfe-import-63/run/" };
	const prod = { bucket: "nfe-webapp-prod", prefix: "media/" };
	expect(() => assertStorageBinding(dev, true, true)).toThrow(
		"production_storage_binding_required",
	);
	expect(() =>
		assertStorageBinding({ ...prod, bucket: "nfe-webapp-dev" }, true, true),
	).toThrow("production_storage_binding_required");
	expect(() =>
		assertStorageBinding({ ...prod, prefix: "nfe-import-63/x/" }, true, true),
	).toThrow("production_storage_binding_required");
	expect(() =>
		assertStorageBinding({ ...prod, prefix: "other/" }, true, true),
	).toThrow("production_storage_binding_required");
	expect(() => assertStorageBinding(prod, true, true)).not.toThrow();
	expect(() => assertStorageBinding(dev, true, false)).not.toThrow();
	expect(() => assertStorageBinding(dev, false, true)).not.toThrow();
});
test("reports pending or blocked imports with exit code 2", () => {
	const ok = {
		media: { quarantined: 0, pending: 0 },
		identity: { deferred: 0 },
	};
	expect(reportExitCode({ ...ok, media: { quarantined: 1, pending: 0 } })).toBe(
		2,
	);
	expect(reportExitCode({ ...ok, media: { quarantined: 0, pending: 1 } })).toBe(
		2,
	);
	expect(reportExitCode({ ...ok, identity: { deferred: 1 } })).toBe(2);
	expect(reportExitCode({ ...ok, isolatedRowImportComplete: false })).toBe(2);
	expect(reportExitCode({ ...ok, reconciliation: { unexplained: 3 } })).toBe(2);
	expect(
		reportExitCode({
			...ok,
			media: { quarantined: 1, pending: 0 },
			acceptedLoss: { ok: true },
		}),
	).toBe(0);
	expect(
		reportExitCode({
			...ok,
			media: { quarantined: 1, pending: 0 },
			acceptedLoss: { ok: false },
		}),
	).toBe(2);
	expect(
		reportExitCode({
			...ok,
			media: { quarantined: 1, pending: 1 },
			acceptedLoss: { ok: true },
		}),
	).toBe(2);
	expect(reportExitCode({ ...ok, reconciliation: { unexplained: 0 } })).toBe(0);
});
const config = {
	endpoint: "http://127.0.0.1:48080/v1",
	project: "nfe-import-63-test",
	database: "nfe",
	key: "k",
	media: { allowedHosts: ["res.cloudinary.com"], bucket: "b", prefix: "p/" },
	b2: {
		B2_BUCKET_NAME: "b",
		B2_REGION: "r",
		B2_ENDPOINT: "https://s3.example.test",
		B2_APPLICATION_KEY_ID: "id",
		B2_APPLICATION_KEY: "secret",
	},
};
const productionConfig = {
	...config,
	endpoint: "https://appwrite.example.com/v1",
	project: "nfe-production",
	production: {
		endpoint: "https://appwrite.example.com/v1",
		project: "nfe-production",
		database: "nfe",
	},
};
test("production target needs the flag and a matching production block", () => {
	expect(resolveTarget(config, false)).toEqual({
		binding: { production: false },
		identity: { isolatedBusinessImport: true },
		production: false,
	});
	expect(resolveTarget(productionConfig, true)).toEqual({
		binding: { production: true },
		identity: { production: true },
		production: true,
	});
	expect(() => resolveTarget(config, true)).toThrow(
		"production_target_mismatch",
	);
	expect(() => resolveTarget(productionConfig, false)).toThrow(
		"production_target_mismatch",
	);
	expect(() =>
		resolveTarget(
			{
				...productionConfig,
				production: { ...productionConfig.production, database: "other" },
			},
			true,
		),
	).toThrow("production_target_mismatch");
	expect(() =>
		resolveTarget(
			{
				...productionConfig,
				endpoint: "https://appwrite.example.com/v2",
				production: {
					...productionConfig.production,
					endpoint: "https://appwrite.example.com/v2",
				},
			},
			true,
		),
	).toThrow("explicit_production_target_required");
	expect(() =>
		resolveTarget(
			{
				...config,
				production: {
					endpoint: config.endpoint,
					project: config.project,
					database: config.database,
				},
			},
			true,
		),
	).toThrow("explicit_production_target_required");
});
test("standard output omits quarantined identifiers and reconciliation samples", () => {
	const report = {
		version: 2,
		quarantine: [{ sourceId: "secret" }],
		reconciliation: {
			version: 1 as const,
			ok: false,
			unexplained: 1,
			identities: { source: 1, target: 1, ok: true },
			entities: {},
			tables: {
				posts: {
					expected: 1,
					actual: 0,
					missing: ["p1"],
					extra: [],
					changed: [],
				},
			},
			orphans: {},
			uniqueness: {},
			counters: {},
			rights: {},
			samples: {
				posts: { checked: 1, mismatched: 1, ids: ["p1"], fields: ["$missing"] },
			},
			discrepancies: [],
		},
	};
	const redacted = redactReport(report);
	expect(JSON.stringify(redacted)).not.toContain("p1");
	expect(JSON.stringify(redacted)).not.toContain("secret");
	expect(redacted.reconciliation?.tables.posts).toEqual({
		expected: 1,
		actual: 0,
		missing: 1,
		extra: 0,
		changed: 0,
	});
	expect(redacted.reconciliation?.samples.posts?.fields).toEqual(["$missing"]);
	expect(redactReport({ version: 2 })).toEqual({ version: 2 });
});
