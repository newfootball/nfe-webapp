import { isIP } from "node:net";
import type { BusinessSource } from "./source";

type Kind = "video" | "thumbnail" | "avatar";
type Provenance = {
	source: "media" | "avatar";
	id: string;
	type: string | null;
	url: string;
	mimetype: string | null;
};
export type PlannedAsset = {
	id: string;
	ownerId: string;
	postId: string | null;
	kind: Kind;
	role: "delivery" | "original";
	mimetype: string | null;
	fetchUrl: string;
	provenance: Provenance;
	createdAt: string;
	updatedAt: string;
};
export type MediaPlanConfig = {
	allowedHosts: string[];
	bucket: string;
	prefix: string;
};
export type MediaPlan = {
	bucket: string;
	prefix: string;
	assets: PlannedAsset[];
};
export type UploadedObject = {
	assetId: string;
	bucket: string;
	objectKey: string;
	versionId: string;
	byteSize: number;
	sha256: string;
	mimetype: string;
};
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;
const fail = (): never => {
	throw new Error("invalid_media_plan");
};
function validateUrl(value: string, allowedHosts: Set<string>): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return fail();
	}
	const host = url.hostname.toLowerCase();
	if (
		!/^https:\/\/[^/?#:@]+(?:[/?#]|$)/i.test(value) ||
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		isIP(host.replace(/^\[|\]$/g, "")) ||
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		!allowedHosts.has(host)
	)
		fail();
	return url;
}
function archiveId(source: Provenance): string {
	return `orig_${new Bun.CryptoHasher("sha256")
		.update(JSON.stringify([source.source, source.id]))
		.digest("hex")
		.slice(0, 31)}`;
}
function deliveryUrl(url: URL, kind: Kind): string {
	const cloudinary = url.hostname === "res.cloudinary.com";
	if (cloudinary && url.pathname.includes("/upload/")) {
		url.pathname = url.pathname.replace(
			"/upload/",
			kind === "video" ? "/upload/f_mp4/" : "/upload/f_webp,q_auto/",
		);
	}
	return url.href;
}
// This private plan contains source URLs and must never be published or logged.
export function createMediaPlan(
	source: BusinessSource,
	config: MediaPlanConfig,
): MediaPlan {
	if (
		!config.bucket ||
		config.bucket.length > 255 ||
		!/^[a-zA-Z0-9/_-]{1,200}\/$/.test(config.prefix) ||
		!config.allowedHosts.length
	)
		fail();
	const allowedHosts = new Set(
		config.allowedHosts.map((host) => {
			if (
				!/^[a-z0-9.-]+$/.test(host) ||
				host !== host.toLowerCase() ||
				isIP(host) ||
				host === "localhost" ||
				host.endsWith(".localhost") ||
				host.endsWith(".local")
			)
				fail();
			return host;
		}),
	);
	const posts = new Map(source.Post.map((p) => [p.id, p]));
	const users = new Set(source.User.map((u) => u.id));
	const assets: PlannedAsset[] = [];
	const append = (
		provenance: Provenance,
		ownerId: string,
		postId: string | null,
		kind: Kind,
		createdAt: string,
		updatedAt: string,
	) => {
		if (
			!idPattern.test(provenance.id) ||
			!idPattern.test(ownerId) ||
			(postId !== null && !idPattern.test(postId))
		)
			fail();
		const url = validateUrl(provenance.url, allowedHosts);
		const id =
			provenance.source === "media"
				? provenance.id
				: `av_${new Bun.CryptoHasher("sha256").update(provenance.id).digest("hex").slice(0, 33)}`;
		assets.push({
			id,
			ownerId,
			postId,
			kind,
			role: "delivery",
			mimetype:
				url.hostname === "res.cloudinary.com" &&
				url.pathname.includes("/upload/")
					? kind === "video"
						? "video/mp4"
						: "image/webp"
					: provenance.mimetype,
			fetchUrl: deliveryUrl(new URL(url), kind),
			provenance,
			createdAt,
			updatedAt,
		});
		assets.push({
			id: archiveId(provenance),
			ownerId,
			postId,
			kind,
			role: "original",
			mimetype: provenance.mimetype,
			fetchUrl: provenance.url,
			provenance,
			createdAt,
			updatedAt,
		});
	};
	for (const media of source.Media) {
		const post = posts.get(media.postId);
		if (!post) return fail();
		if (!users.has(post.userId)) fail();
		const kind = media.mimetype.toLowerCase().startsWith("video/")
			? "video"
			: media.mimetype.toLowerCase().startsWith("image/")
				? "thumbnail"
				: fail();
		append(
			{
				source: "media",
				id: media.id,
				type: media.type,
				url: media.url,
				mimetype: media.mimetype,
			},
			post.userId,
			post.id,
			kind,
			media.createdAt,
			media.updatedAt,
		);
	}
	for (const user of source.User)
		if (user.image)
			append(
				{
					source: "avatar",
					id: user.id,
					type: null,
					url: user.image,
					mimetype: null,
				},
				user.id,
				null,
				"avatar",
				user.createdAt,
				user.updatedAt ?? user.createdAt,
			);
	if (new Set(assets.map((a) => a.id)).size !== assets.length) fail();
	const postKinds = assets
		.filter((a) => a.postId !== null && a.role === "delivery")
		.map((a) => JSON.stringify([a.postId, a.kind]));
	if (new Set(postKinds).size !== postKinds.length) fail();
	return { bucket: config.bucket, prefix: config.prefix, assets };
}
function normalizeDate(value: string): string {
	const parsed = new Date(
		/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`,
	);
	if (!Number.isFinite(parsed.getTime())) return fail();
	return parsed.toISOString();
}
// Rows are only constructed after upload metadata is known; no bytes or signed URLs are retained.
export function buildMediaManifest(
	plan: MediaPlan,
	uploaded: UploadedObject[],
) {
	if (
		uploaded.length !== plan.assets.length ||
		new Set(uploaded.map((u) => u.assetId)).size !== uploaded.length
	)
		fail();
	const byId = new Map(uploaded.map((u) => [u.assetId, u]));
	return plan.assets.map((asset) => {
		const object = byId.get(asset.id);
		const key = `${plan.prefix}business-import/${asset.id}`;
		if (
			!object ||
			object.bucket !== plan.bucket ||
			object.objectKey !== key ||
			!object.versionId ||
			object.versionId.length > 1024 ||
			!Number.isSafeInteger(object.byteSize) ||
			object.byteSize <= 0 ||
			!/^[a-f0-9]{64}$/.test(object.sha256) ||
			!object.mimetype ||
			object.mimetype.length > 128 ||
			(asset.mimetype !== null && object.mimetype !== asset.mimetype) ||
			(asset.mimetype === null &&
				!object.mimetype.startsWith(
					asset.kind === "video" ? "video/" : "image/",
				))
		)
			return fail();
		return {
			id: asset.id,
			ownerId: asset.ownerId,
			postId: asset.postId,
			kind: asset.role === "original" ? `original-${asset.kind}` : asset.kind,
			state: asset.role === "delivery" ? "ATTACHED" : "REJECTED",
			provider: "B2",
			bucket: object.bucket,
			objectKey: object.objectKey,
			versionId: object.versionId,
			byteSize: object.byteSize,
			sha256: object.sha256,
			mimetype: object.mimetype,
			createdAt: normalizeDate(asset.createdAt),
			updatedAt: normalizeDate(asset.updatedAt),
		};
	});
}
