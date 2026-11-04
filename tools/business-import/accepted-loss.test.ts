import { expect, test } from "bun:test";
import {
	candidateManifest,
	evaluateAcceptedLoss,
	manifestDigest,
	parseManifest,
} from "./accepted-loss";
import type { MediaPlan } from "./media-plan";

const asset = (id: string, source: "media" | "avatar", sourceId: string) => ({
	id,
	provenance: { source, id: sourceId },
});
const plan = {
	bucket: "nfe-webapp-dev",
	prefix: "nfe-import-63/x/",
	assets: [
		asset("m1", "media", "m1"),
		asset("orig_m1", "media", "m1"),
		asset("m2", "media", "m2"),
		asset("orig_m2", "media", "m2"),
		asset("av_u", "avatar", "u"),
		asset("orig_u", "avatar", "u"),
	],
} as MediaPlan;
const digest = "a".repeat(64);
const quarantine = [
	{ assetId: "orig_m1", urlHash: "h", reason: "http_404" as const },
	{ assetId: "m1", urlHash: "h", reason: "http_404" as const },
	{ assetId: "av_u", urlHash: "h", reason: "http_403" as const },
];
test("no manifest leaves every quarantined pair unaccepted", () => {
	const loss = evaluateAcceptedLoss(null, digest, plan, quarantine);
	expect(loss).toMatchObject({
		manifest: false,
		accepted: 0,
		unaccepted: 2,
		stale: 0,
		ok: false,
	});
	expect(loss.entries.map((e) => [e.sourceId, e.status, e.assetIds])).toEqual([
		["m1", "missing_unaccepted", ["m1", "orig_m1"]],
		["u", "missing_unaccepted", ["av_u"]],
	]);
	expect(evaluateAcceptedLoss(null, digest, plan, []).ok).toBe(true);
});
test("candidate manifest covers exactly the quarantined pairs and accepts after signing", () => {
	const candidate = candidateManifest(digest, plan, quarantine);
	expect(candidate.entries).toEqual([
		{
			source: "media",
			sourceId: "m1",
			assetIds: ["m1", "orig_m1"],
			reason: "http_404",
		},
		{ source: "avatar", sourceId: "u", assetIds: ["av_u"], reason: "http_403" },
	]);
	const manifest = parseManifest({ ...candidate, reference: "DEC-2026-11-04" });
	const loss = evaluateAcceptedLoss(manifest, digest, plan, quarantine);
	expect(loss).toMatchObject({
		manifest: true,
		snapshotMatch: true,
		accepted: 2,
		unaccepted: 0,
		stale: 0,
		ok: true,
		digest: manifestDigest(manifest),
	});
	expect(loss.entries.every((e) => e.status === "missing_accepted")).toBe(true);
});
test("stale entries, partial coverage and another snapshot block acceptance", () => {
	const signed = parseManifest({
		...candidateManifest(digest, plan, quarantine),
		reference: "DEC",
	});
	const other = evaluateAcceptedLoss(
		"b".repeat(64) === digest
			? signed
			: { ...signed, sourceDigest: "b".repeat(64) },
		digest,
		plan,
		quarantine,
	);
	expect(other).toMatchObject({
		snapshotMatch: false,
		accepted: 0,
		stale: 2,
		unaccepted: 2,
		ok: false,
	});
	const available = evaluateAcceptedLoss(
		signed,
		digest,
		plan,
		quarantine.slice(0, 2),
	);
	expect(available).toMatchObject({
		accepted: 1,
		stale: 1,
		unaccepted: 0,
		ok: false,
	});
	expect(available.entries.find((e) => e.sourceId === "u")?.status).toBe(
		"stale",
	);
	const partial = evaluateAcceptedLoss(
		parseManifest({ ...signed, entries: signed.entries.slice(0, 1) }),
		digest,
		plan,
		quarantine,
	);
	expect(partial).toMatchObject({
		accepted: 1,
		stale: 0,
		unaccepted: 1,
		ok: false,
	});
	const narrower = evaluateAcceptedLoss(
		parseManifest({
			...signed,
			entries: [
				{ ...signed.entries[0]!, assetIds: ["m1"] },
				signed.entries[1]!,
			],
		}),
		digest,
		plan,
		quarantine,
	);
	expect(narrower).toMatchObject({
		accepted: 1,
		stale: 1,
		unaccepted: 1,
		ok: false,
	});
	expect(() =>
		evaluateAcceptedLoss(signed, digest, plan, [
			{ assetId: "ghost", urlHash: "h", reason: "http_404" },
		]),
	).toThrow("unknown_quarantined_asset");
});
test("manifest rejects duplicates, unknown fields and empty references", () => {
	const base = candidateManifest(digest, plan, quarantine);
	expect(() => parseManifest(base)).not.toThrow();
	expect(() => parseManifest({ ...base, reference: "" })).toThrow(
		"invalid_accepted_loss_manifest",
	);
	expect(() => parseManifest({ ...base, extra: 1 })).toThrow(
		"invalid_accepted_loss_manifest",
	);
	expect(() =>
		parseManifest({ ...base, entries: [...base.entries, base.entries[0]] }),
	).toThrow("invalid_accepted_loss_manifest");
	expect(() => parseManifest({ ...base, sourceDigest: "x" })).toThrow(
		"invalid_accepted_loss_manifest",
	);
});
