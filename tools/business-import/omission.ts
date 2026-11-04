import type { PreparedAsset, QuarantinedAsset } from "./download";
import type { MediaPlan } from "./media-plan";
import type { BusinessSource } from "./source";

export function omitUnavailableMedia(
	source: BusinessSource,
	plan: MediaPlan,
	result: {
		prepared: PreparedAsset[];
		quarantine: QuarantinedAsset[];
		ready: boolean;
	},
) {
	const ids = new Set(plan.assets.map((asset) => asset.id));
	const observed = [...result.prepared, ...result.quarantine].map(
		(asset) => asset.assetId,
	);
	if (
		ids.size !== plan.assets.length ||
		observed.length !== ids.size ||
		new Set(observed).size !== observed.length ||
		observed.some((id) => !ids.has(id))
	)
		throw new Error("incomplete_media_preparation");
	const groups = new Map<string, typeof plan.assets>();
	for (const asset of plan.assets) {
		const key = JSON.stringify([asset.provenance.source, asset.provenance.id]);
		groups.set(key, [...(groups.get(key) ?? []), asset]);
	}
	const missing = new Map(
		result.quarantine.map((entry) => [entry.assetId, entry]),
	);
	const omitted = new Set<string>();
	const omissions = [];
	for (const assets of groups.values()) {
		const first = assets[0];
		if (!first) continue;
		const failures = assets.flatMap((asset) => {
			const entry = missing.get(asset.id);
			return entry ? [{ assetId: entry.assetId, reason: entry.reason }] : [];
		});
		if (failures.length) {
			for (const asset of assets) omitted.add(asset.id);
			omissions.push({
				source: first.provenance.source,
				sourceId: first.provenance.id,
				assetIds: assets.map((asset) => asset.id),
				missing: failures,
			});
		}
	}
	const mediaIds = new Set(
		omissions
			.filter((entry) => entry.source === "media")
			.map((entry) => entry.sourceId),
	);
	const avatarIds = new Set(
		omissions
			.filter((entry) => entry.source === "avatar")
			.map((entry) => entry.sourceId),
	);
	const derived = structuredClone(source);
	derived.Media = derived.Media.filter((media) => !mediaIds.has(media.id));
	derived.User = derived.User.map((user) =>
		avatarIds.has(user.id) ? { ...user, image: null } : user,
	);
	const derivedPlan = {
		...plan,
		assets: plan.assets.filter((asset) => !omitted.has(asset.id)),
	};
	const prepared = result.prepared.filter(
		(asset) => !omitted.has(asset.assetId),
	);
	const complete =
		prepared.length === derivedPlan.assets.length &&
		new Set(prepared.map((asset) => asset.assetId)).size ===
			derivedPlan.assets.length &&
		prepared.every((asset) =>
			derivedPlan.assets.some((planned) => planned.id === asset.assetId),
		);
	return { source: derived, plan: derivedPlan, prepared, omissions, complete };
}
