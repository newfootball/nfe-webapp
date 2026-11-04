import { createHash } from "node:crypto";
import { z } from "zod";
import type { QuarantinedAsset } from "./download";
import type { MediaPlan } from "./media-plan";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const manifestSchema = z.strictObject({
	version: z.literal(1),
	sourceDigest: sha256,
	reference: z.string().min(1).max(512),
	entries: z.array(
		z.strictObject({
			source: z.enum(["media", "avatar"]),
			sourceId: z.string().min(1),
			assetIds: z.array(z.string().min(1)).min(1),
			reason: z.string().min(1).max(512),
		}),
	),
});
export type AcceptedLossManifest = z.infer<typeof manifestSchema>;
export type LossStatus = "missing_accepted" | "missing_unaccepted" | "stale";
export type LossEntry = {
	source: "media" | "avatar";
	sourceId: string;
	assetIds: string[];
	status: LossStatus;
	reason: string;
};
export type AcceptedLoss = {
	manifest: boolean;
	snapshotMatch: boolean;
	digest: string | null;
	accepted: number;
	unaccepted: number;
	stale: number;
	ok: boolean;
	entries: LossEntry[];
};
export const sourceDigest = (text: string) =>
	createHash("sha256").update(text).digest("hex");
export function parseManifest(input: unknown): AcceptedLossManifest {
	const parsed = manifestSchema.safeParse(input);
	if (!parsed.success) throw new Error("invalid_accepted_loss_manifest");
	const pairs = parsed.data.entries.map((e) =>
		JSON.stringify([e.source, e.sourceId]),
	);
	const assets = parsed.data.entries.flatMap((e) => e.assetIds);
	if (
		new Set(pairs).size !== pairs.length ||
		new Set(assets).size !== assets.length
	)
		throw new Error("invalid_accepted_loss_manifest");
	return parsed.data;
}
export const manifestDigest = (manifest: AcceptedLossManifest) =>
	createHash("sha256")
		.update(
			JSON.stringify({
				...manifest,
				entries: [...manifest.entries]
					.map((e) => ({ ...e, assetIds: [...e.assetIds].sort() }))
					.sort((a, b) =>
						`${a.source}:${a.sourceId}`.localeCompare(
							`${b.source}:${b.sourceId}`,
						),
					),
			}),
		)
		.digest("hex");
// A candidate manifest for the operator to review, sign with a reference and
// store privately. It is never applied without an explicit path argument.
export function candidateManifest(
	digest: string,
	plan: MediaPlan,
	quarantine: QuarantinedAsset[],
): AcceptedLossManifest {
	const pairs = groupQuarantine(plan, quarantine);
	return {
		version: 1,
		sourceDigest: digest,
		reference: "REPLACE_WITH_DECISION_REFERENCE",
		entries: [...pairs.values()].map((pair) => ({
			source: pair.source,
			sourceId: pair.sourceId,
			assetIds: pair.assetIds,
			reason: [...new Set(pair.reasons)].sort().join(","),
		})),
	};
}
function groupQuarantine(plan: MediaPlan, quarantine: QuarantinedAsset[]) {
	const byAsset = new Map(plan.assets.map((asset) => [asset.id, asset]));
	const pairs = new Map<
		string,
		{
			source: "media" | "avatar";
			sourceId: string;
			assetIds: string[];
			reasons: string[];
		}
	>();
	for (const item of quarantine) {
		const asset = byAsset.get(item.assetId);
		if (!asset) throw new Error("unknown_quarantined_asset");
		const key = JSON.stringify([asset.provenance.source, asset.provenance.id]);
		const pair = pairs.get(key) ?? {
			source: asset.provenance.source,
			sourceId: asset.provenance.id,
			assetIds: [],
			reasons: [],
		};
		pair.assetIds.push(item.assetId);
		pair.reasons.push(item.reason);
		pairs.set(key, pair);
	}
	for (const pair of pairs.values()) pair.assetIds.sort();
	return pairs;
}
export function evaluateAcceptedLoss(
	manifest: AcceptedLossManifest | null,
	digest: string,
	plan: MediaPlan,
	quarantine: QuarantinedAsset[],
): AcceptedLoss {
	const pairs = groupQuarantine(plan, quarantine);
	const snapshotMatch = manifest?.sourceDigest === digest;
	const entries: LossEntry[] = [];
	const covered = new Set<string>();
	let accepted = 0,
		stale = 0;
	for (const entry of manifest?.entries ?? []) {
		const key = JSON.stringify([entry.source, entry.sourceId]);
		const pair = pairs.get(key);
		const exact =
			snapshotMatch &&
			pair !== undefined &&
			JSON.stringify([...entry.assetIds].sort()) ===
				JSON.stringify(pair.assetIds);
		if (exact) {
			covered.add(key);
			accepted++;
		} else stale++;
		entries.push({
			source: entry.source,
			sourceId: entry.sourceId,
			assetIds: [...entry.assetIds].sort(),
			status: exact ? "missing_accepted" : "stale",
			reason: entry.reason,
		});
	}
	let unaccepted = 0;
	for (const [key, pair] of pairs)
		if (!covered.has(key)) {
			unaccepted++;
			entries.push({
				source: pair.source,
				sourceId: pair.sourceId,
				assetIds: pair.assetIds,
				status: "missing_unaccepted",
				reason: [...new Set(pair.reasons)].sort().join(","),
			});
		}
	return {
		manifest: manifest !== null,
		snapshotMatch,
		digest: manifest ? manifestDigest(manifest) : null,
		accepted,
		unaccepted,
		stale,
		ok: unaccepted === 0 && stale === 0 && (manifest === null || snapshotMatch),
		entries,
	};
}
