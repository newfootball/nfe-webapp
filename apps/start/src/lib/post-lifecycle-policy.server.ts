import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import type { Models } from "node-appwrite";

// Imported originals are eligible only alongside their exact attached delivery.
export function eligiblePostAsset(
	a: Models.DefaultRow,
	assets: Models.DefaultRow[],
) {
	if (a.state === "ATTACHED")
		return a.kind === "video" || a.kind === "thumbnail";
	if (
		a.state !== "REJECTED" ||
		!["original-video", "original-thumbnail"].includes(a.kind)
	)
		return false;
	try {
		const meta = JSON.parse(a.metadataJson);
		if (
			!meta ||
			Object.keys(meta).sort().join(",") !== "role,source,sourceId" ||
			meta.role !== "original" ||
			meta.source !== "media" ||
			typeof meta.sourceId !== "string"
		)
			return false;
		const id = `orig_${createHash("sha256")
			.update(JSON.stringify(["media", meta.sourceId]))
			.digest("hex")
			.slice(0, 31)}`;
		return (
			a.$id === id &&
			assets.some(
				(delivery) =>
					delivery.$id === meta.sourceId &&
					delivery.state === "ATTACHED" &&
					delivery.ownerId === a.ownerId &&
					delivery.postId === a.postId &&
					delivery.kind === a.kind.slice("original-".length),
			)
		);
	} catch {
		return false;
	}
}
