import { createHash } from "node:crypto";
import {
	buildMediaManifest,
	createMediaPlan,
	type MediaPlanConfig,
	type UploadedObject,
} from "./media-plan";
import type { BusinessSource } from "./source";

export type ProjectionRow = {
	table: string;
	id: string;
	data: Record<string, unknown>;
	permissions: string[];
};
const fail = (): never => {
	throw new Error("invalid_business_projection");
};
const validId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id);
const read = (id: string) => `read("user:${id}")`;
const admin = 'read("label:admin")';
const publicRead = 'read("any")';
const fold = (value: string) => value.normalize("NFC").toLocaleLowerCase("fr");
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 36);
function date(value: string): string {
	const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`;
	const parsed = new Date(normalized);
	if (!Number.isFinite(parsed.getTime())) return fail();
	return parsed.toISOString();
}
const optionalDate = (value: string | null) =>
	value === null ? null : date(value);
const times = (row: { createdAt: string; updatedAt: string }) => ({
	createdAt: date(row.createdAt),
	updatedAt: date(row.updatedAt),
});
const userReaders = (...ids: string[]) => [...new Set(ids)].map(read);

export function projectBusiness(
	source: BusinessSource,
	options: { config: MediaPlanConfig; uploaded: UploadedObject[] },
) {
	const rows: ProjectionRow[] = [];
	const seen = new Set<string>();
	function add(
		table: string,
		id: string,
		data: Record<string, unknown>,
		permissions: string[],
	) {
		if (!validId(id) || seen.has(`${table}:${id}`)) return fail();
		seen.add(`${table}:${id}`);
		rows.push({ table, id, data, permissions });
	}
	const plan = createMediaPlan(source, options.config);
	const manifest = buildMediaManifest(plan, options.uploaded);
	const byId = new Map(manifest.map((asset) => [asset.id, asset]));
	for (const asset of manifest) {
		const planned = plan.assets.find((entry) => entry.id === asset.id);
		if (!planned) return fail();
		const { id, ...data } = asset;
		add(
			"media_assets",
			id,
			{
				...data,
				metadataJson:
					planned.role === "original"
						? JSON.stringify({
								role: "original",
								source: planned.provenance.source,
								sourceId: planned.provenance.id,
							})
						: null,
			},
			[read(asset.ownerId)],
		);
	}
	const posts = new Map(source.Post.map((p) => [p.id, p]));
	for (const u of source.User) {
		const avatar = plan.assets.find(
			(asset) =>
				asset.role === "delivery" &&
				asset.provenance.source === "avatar" &&
				asset.provenance.id === u.id,
		);
		const image = avatar ? `/media/${avatar.id}` : null;
		add(
			"profiles",
			u.id,
			{
				name: u.name,
				nameFolded: u.name === null ? null : fold(u.name),
				image,
				biography: u.biography,
				position: u.position ?? [],
				foot: u.foot ?? [],
				localisation: u.localisation,
				userType: u.userType,
				isOnboarded: u.isOnboarded,
				createdAt: date(u.createdAt),
				updatedAt: optionalDate(u.updatedAt),
			},
			u.isOnboarded ? [publicRead] : [admin, read(u.id)],
		);
		add(
			"private_profiles",
			u.id,
			{
				birthday: optionalDate(u.birthday),
				fullName: u.fullName,
				license: u.license,
				contract: u.contract,
				size: u.size,
				weight: u.weight,
				gender: u.gender,
				role: u.role,
			},
			[admin, read(u.id)],
		);
	}
	for (const p of source.Post) {
		add(
			"posts",
			p.id,
			{
				slug: p.slug,
				userId: p.userId,
				title: p.title,
				titleFolded: fold(p.title),
				description: p.description,
				descriptionFolded: fold(p.description),
				type: p.type,
				status: p.status,
				...times(p),
				expiresAt: optionalDate(p.expiresAt),
				validatedAt: optionalDate(p.validatedAt),
				publishedAt: optionalDate(p.publishedAt),
			},
			p.status === "PUBLISHED" ? [publicRead] : [admin, read(p.userId)],
		);
		add("post_private", p.id, { spamScore: p.spamScore }, [admin]);
	}
	for (const m of source.Media) {
		const asset = byId.get(m.id);
		const post = posts.get(m.postId);
		if (!asset || !post) return fail();
		const { id: _id, sha256, kind: _kind, ...storage } = asset;
		add(
			"media",
			m.id,
			{
				type: m.type,
				filename: m.filename,
				label: m.label,
				metadataJson: m.metadata === null ? null : JSON.stringify(m.metadata),
				...storage,
				checksum: sha256,
				state: "READY",
			},
			[read(post.userId)],
		);
	}
	for (const f of source.Follow)
		add(
			"follows",
			f.id,
			{ followerId: f.followerId, followingId: f.followingId, ...times(f) },
			[publicRead],
		);
	for (const [table, entries] of [
		["likes", source.Like],
		["favorites", source.Favorite],
		["comments", source.Comment],
		["signals", source.PostSignal],
	] as const) {
		for (const item of entries) {
			const { id, ...data } = item;
			add(
				table,
				id,
				{ ...data, ...times(item) },
				table === "favorites"
					? [read(item.userId)]
					: table === "signals"
						? [admin]
						: [],
			);
		}
	}
	const conversations = new Map<string, (typeof source.Message)[number]>();
	for (const m of source.Message) {
		add(
			"messages",
			m.id,
			{
				fromUserId: m.fromUserId,
				toUserId: m.toUserId,
				content: m.content,
				readAt: optionalDate(m.readAt),
				...times(m),
			},
			userReaders(m.fromUserId, m.toUserId),
		);
		const pair = [m.fromUserId, m.toUserId].sort();
		const key = hash(JSON.stringify(["conversation", ...pair]));
		const previous = conversations.get(key);
		if (
			!previous ||
			date(m.createdAt) > date(previous.createdAt) ||
			(date(m.createdAt) === date(previous.createdAt) && m.id > previous.id)
		)
			conversations.set(key, m);
	}
	for (const [id, m] of conversations) {
		const [participantA, participantB] = [m.fromUserId, m.toUserId].sort();
		add(
			"message_conversations",
			id,
			{
				participantA,
				participantB,
				latestId: m.id,
				latestAt: date(m.createdAt),
			},
			userReaders(m.fromUserId, m.toUserId),
		);
	}
	for (const n of source.Notification) {
		const eventId = `legacy:${n.id}`;
		add(
			"notifications_v1",
			hash(`notification-v1:${eventId}`),
			{
				eventId,
				type: n.type,
				actorId: null,
				recipientId: n.userId,
				targetId: null,
				entityId: n.id,
				occurredAt: date(n.createdAt),
				source: "legacy",
				readAt: optionalDate(n.readAt),
			},
			[read(n.userId)],
		);
	}
	// Complete original records are private provenance, separate from Appwrite rows.
	return { rows, privateProvenance: structuredClone(source) };
}
