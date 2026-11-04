import { expect, test } from "bun:test";
import type { AcceptedLoss } from "./accepted-loss";
import { BUSINESS_TABLES } from "./contract";
import { createMediaPlan } from "./media-plan";
import { type ProjectionRow, projectBusiness } from "./projection";
import { reconcile } from "./reconcile";
import type { BusinessSource } from "./source";

const config = {
	allowedHosts: ["res.cloudinary.com"],
	bucket: "nfe-webapp-dev",
	prefix: "nfe-import-63/0a4a62b0-9c2c-4f9e-8f8c-4b9b0b6b7f1a/",
};
const at = "2024-01-01T00:00:00.000Z";
const times = { createdAt: at, updatedAt: at };
const user = (id: string, image: string | null): BusinessSource["User"][0] => ({
	id,
	name: `user-${id}`,
	email: `${id}@example.com`,
	emailVerified: true,
	image,
	birthday: null,
	fullName: null,
	biography: null,
	position: null,
	foot: null,
	license: null,
	contract: null,
	size: null,
	weight: null,
	localisation: null,
	gender: null,
	role: "USER",
	userType: "PLAYER",
	isOnboarded: id === "u1",
	createdAt: at,
	updatedAt: null,
});
const media = (id: string, postId: string): BusinessSource["Media"][0] => ({
	id,
	type: "landingImage",
	postId,
	mimetype: "image/jpeg",
	url: `https://res.cloudinary.com/demo/image/upload/${id}.jpg`,
	filename: null,
	label: null,
	metadata: null,
	...times,
});
const source = (): BusinessSource => ({
	User: [
		user("u1", "https://res.cloudinary.com/demo/image/upload/u1.jpg"),
		user("u2", null),
	],
	Post: [
		{
			id: "p1",
			slug: "p1",
			userId: "u1",
			title: "t",
			type: "video",
			status: "PUBLISHED",
			description: "d",
			spamScore: null,
			...times,
			expiresAt: null,
			validatedAt: null,
			publishedAt: at,
		},
		{
			id: "p2",
			slug: "p2",
			userId: "u2",
			title: "t2",
			type: null,
			status: "DRAFT",
			description: "d2",
			spamScore: null,
			...times,
			expiresAt: null,
			validatedAt: null,
			publishedAt: null,
		},
	],
	Media: [media("m1", "p1"), media("m2", "p2")],
	Follow: [{ id: "f1", followerId: "u2", followingId: "u1", ...times }],
	Like: [{ id: "l1", userId: "u2", postId: "p1", ...times }],
	Favorite: [{ id: "fav1", userId: "u2", postId: "p1", ...times }],
	Comment: [{ id: "c1", userId: "u2", postId: "p1", content: "hi", ...times }],
	Message: [
		{
			id: "msg1",
			fromUserId: "u1",
			toUserId: "u2",
			content: "a",
			readAt: null,
			...times,
		},
		{
			id: "msg2",
			fromUserId: "u2",
			toUserId: "u1",
			content: "b",
			readAt: at,
			...times,
		},
	],
	Notification: [
		{
			id: "n1",
			userId: "u2",
			type: "LIKE",
			content: "x",
			link: null,
			readAt: null,
			...times,
		},
	],
	PostSignal: [
		{
			id: "s1",
			userId: "u2",
			postId: "p1",
			reason: "SPAM",
			details: null,
			status: "PENDING",
			...times,
		},
	],
});
function project(active: BusinessSource) {
	const plan = createMediaPlan(active, config);
	const uploaded = plan.assets.map((asset) => ({
		assetId: asset.id,
		bucket: config.bucket,
		objectKey: `${config.prefix}business-import/${asset.id}`,
		versionId: "v1",
		byteSize: 1,
		sha256: "ab".repeat(32),
		mimetype: asset.mimetype ?? "image/webp",
	}));
	return projectBusiness(active, { config, uploaded }).rows;
}
const group = (rows: ProjectionRow[]) =>
	Object.fromEntries(
		BUSINESS_TABLES.map((table) => [
			table,
			rows
				.filter((row) => row.table === table)
				.map((row) => structuredClone(row)),
		]),
	);
const noLoss: AcceptedLoss = {
	manifest: false,
	snapshotMatch: false,
	digest: null,
	accepted: 0,
	unaccepted: 0,
	stale: 0,
	ok: true,
	entries: [],
};
const base = (active: BusinessSource, rows: ProjectionRow[]) => ({
	source: source(),
	active,
	rows,
	target: group(rows),
	loss: noLoss,
	identities: { source: 2, target: 2 },
});
test("a faithful target reconciles with intended transformations only", () => {
	const active = source();
	const rows = project(active);
	const report = reconcile(base(active, rows));
	expect(report.ok).toBe(true);
	expect(report.unexplained).toBe(0);
	expect(report.discrepancies.map((d) => d.category)).toEqual(
		report.discrepancies.map(() => "intended_transformation"),
	);
	expect(report.entities.Media?.tables.media_assets).toEqual({
		expected: 6,
		actual: 6,
	});
	expect(report.entities.Message?.tables.message_conversations).toEqual({
		expected: 1,
		actual: 1,
	});
	expect(report.counters.unread_messages_per_recipient?.checked).toBe(1);
	expect(report.counters.unread_notifications_per_user?.mismatched).toBe(0);
	expect(Object.values(report.rights).every((r) => r.mismatched === 0)).toBe(
		true,
	);
	expect(report.samples.posts).toEqual({
		checked: 2,
		mismatched: 0,
		ids: [],
		fields: [],
	});
});
test("omitted media must be covered by the accepted-loss manifest", () => {
	const active = source();
	active.Media = active.Media.filter((m) => m.id !== "m2");
	active.User = active.User.map((u) =>
		u.id === "u1" ? { ...u, image: null } : u,
	);
	const rows = project(active);
	const unexplained = reconcile(base(active, rows));
	expect(unexplained.ok).toBe(false);
	expect(
		unexplained.discrepancies.filter((d) => d.category === "unexplained"),
	).toEqual([
		{
			category: "unexplained",
			scope: "Media",
			detail: "omitted_without_accepted_loss",
			count: 1,
		},
		{
			category: "unexplained",
			scope: "User.image",
			detail: "omitted_without_accepted_loss",
			count: 1,
		},
	]);
	const entry = (source: "media" | "avatar", sourceId: string) => ({
		source,
		sourceId,
		assetIds: [],
		status: "missing_accepted" as const,
		reason: "test data",
	});
	const accepted = reconcile({
		...base(active, rows),
		loss: {
			...noLoss,
			manifest: true,
			snapshotMatch: true,
			accepted: 2,
			entries: [entry("media", "m2"), entry("avatar", "u1")],
		},
	});
	expect(accepted.ok).toBe(true);
	expect(accepted.entities.Media).toEqual({
		source: 2,
		active: 1,
		omitted: 1,
		tables: {
			media: { expected: 1, actual: 1 },
			media_assets: { expected: 2, actual: 2 },
		},
	});
	expect(
		accepted.discrepancies.filter((d) => d.category === "accepted_loss"),
	).toHaveLength(2);
});
test("every target deviation is flagged as unexplained", () => {
	const active = source();
	const rows = project(active);
	const target = group(rows);
	target.posts = target.posts?.filter((row) => row.id !== "p2") ?? [];
	const like = target.likes?.[0];
	if (!like) throw new Error("fixture");
	target.likes = [like, { ...like, id: "l2" }];
	const profile = target.profiles?.find((row) => row.id === "u1");
	if (!profile) throw new Error("fixture");
	profile.permissions = ['read("label:admin")'];
	profile.data.name = "renamed";
	target.follows = [
		...(target.follows ?? []),
		{
			table: "follows",
			id: "f9",
			data: { followerId: "ghost", followingId: "u1", ...times },
			permissions: ['read("any")'],
		},
	];
	const report = reconcile({
		...base(active, rows),
		target,
		identities: { source: 2, target: 3 },
	});
	expect(report.ok).toBe(false);
	const details = report.discrepancies
		.filter((d) => d.category === "unexplained")
		.map((d) => `${d.scope}:${d.detail}:${d.count}`);
	expect(details).toEqual(
		expect.arrayContaining([
			"posts:entity_volume_differs:1",
			"posts:missing_rows:1",
			"likes:foreign_rows:1",
			"profiles:changed_rows:1",
			"follows:foreign_rows:1",
			"post_private.$id:orphan_reference:1",
			"media.postId:orphan_reference:1",
			"follows.followerId:orphan_reference:1",
			"likes(postId,userId):duplicate_unique_key:1",
			"likes_per_post:derived_counter_differs:1",
			"followers_per_user:derived_counter_differs:1",
			"following_per_user:derived_counter_differs:1",
			"posts_per_user:derived_counter_differs:1",
			"profiles:effective_rights_differ:1",
			"profiles:sample_fields_differ:1",
			"identities:target_identity_count_differs:1",
		]),
	);
	expect(report.tables.posts?.missing).toEqual(["p2"]);
	expect(report.samples.profiles?.fields).toEqual(["$permissions", "name"]);
	expect(report.uniqueness["likes(postId,userId)"]?.ids).toEqual(["l2"]);
});
test("listing must cover every contract table", () => {
	const active = source();
	const rows = project(active);
	const { signals: _signals, ...target } = group(rows);
	expect(() => reconcile({ ...base(active, rows), target })).toThrow(
		"incomplete_target_listing",
	);
});
