import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createMediaPlan } from "./media-plan";
import { projectBusiness } from "./projection";
import { projectSource } from "./source";

const t = {
	createdAt: "2026-01-01T01:02:03",
	updatedAt: "2026-01-02T01:02:03Z",
};
function input() {
	return projectSource({
		version: 1,
		tables: {
			User: [
				{
					id: "user",
					name: "Éric",
					email: "secret@example.test",
					emailVerified: true,
					image: null,
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
					isOnboarded: true,
					...t,
				},
				{
					id: "peer",
					name: null,
					email: null,
					emailVerified: false,
					image: null,
					birthday: null,
					fullName: null,
					biography: null,
					position: [],
					foot: [],
					license: null,
					contract: null,
					size: null,
					weight: null,
					localisation: null,
					gender: null,
					role: "USER",
					userType: "USER",
					isOnboarded: false,
					...t,
				},
			],
			Account: [],
			Post: [
				{
					id: "post",
					slug: "original-slug",
					userId: "user",
					title: "ÉTUDE",
					description: "Text",
					type: "video",
					status: "PUBLISHED",
					spamScore: "NONE",
					expiresAt: null,
					validatedAt: null,
					publishedAt: null,
					...t,
				},
			],
			Media: [
				{
					id: "media",
					postId: "post",
					type: "mainVideo",
					mimetype: "image/jpeg",
					url: "https://res.cloudinary.com/demo/image/upload/private.jpg",
					filename: null,
					label: null,
					metadata: null,
					...t,
				},
			],
			Follow: [{ id: "follow", followerId: "user", followingId: "peer", ...t }],
			Like: [{ id: "like", userId: "user", postId: "post", ...t }],
			Favorite: [{ id: "favorite", userId: "user", postId: "post", ...t }],
			Comment: [
				{ id: "comment", userId: "user", postId: "post", content: "hi", ...t },
			],
			PostSignal: [
				{
					id: "signal",
					userId: "user",
					postId: "post",
					reason: "SPAM",
					details: null,
					status: "PENDING",
					...t,
				},
			],
			Message: [
				{
					id: "m1",
					fromUserId: "user",
					toUserId: "peer",
					content: "one",
					readAt: null,
					...t,
				},
				{
					id: "m2",
					fromUserId: "peer",
					toUserId: "user",
					content: "two",
					readAt: "2026-01-03T00:00:00",
					...t,
				},
			],
			Notification: [
				{
					id: "notice",
					userId: "user",
					type: "LIKE",
					content: "private-content",
					link: "/private",
					readAt: "2026-01-03T00:00:00",
					...t,
				},
			],
		},
	}).source;
}
const config = {
	allowedHosts: ["res.cloudinary.com"],
	bucket: "bucket",
	prefix: "private/",
};
function options(source: ReturnType<typeof input>) {
	const plan = createMediaPlan(source, config);
	return {
		config,
		uploaded: plan.assets.map((a) => ({
			assetId: a.id,
			bucket: plan.bucket,
			objectKey: `${plan.prefix}business-import/${a.id}`,
			versionId: "mock-version",
			byteSize: 123,
			sha256: "a".repeat(64),
			mimetype: a.mimetype ?? "image/jpeg",
		})),
	};
}
describe("business projection", () => {
	test("preserves dates, ids, private provenance, ACLs and conversation index", () => {
		const source = input();
		const result = projectBusiness(source, options(source));
		const find = (table: string) => result.rows.find((r) => r.table === table)!;
		expect(find("profiles").data).toMatchObject({
			nameFolded: "éric",
			position: [],
			createdAt: "2026-01-01T01:02:03.000Z",
		});
		expect(find("posts").data).toMatchObject({
			slug: "original-slug",
			titleFolded: "étude",
		});
		expect(find("private_profiles").permissions).toEqual([
			'read("label:admin")',
			'read("user:user")',
		]);
		expect(find("favorites").permissions).toEqual(['read("user:user")']);
		expect(find("comments").permissions).toEqual([]);
		expect(find("signals").permissions).toEqual(['read("label:admin")']);
		expect(find("message_conversations").data).toMatchObject({
			participantA: "peer",
			participantB: "user",
			latestId: "m2",
		});
		const n = find("notifications_v1");
		expect(n.id).toBe(
			createHash("sha256")
				.update("notification-v1:legacy:notice")
				.digest("hex")
				.slice(0, 36),
		);
		expect(n.data).toMatchObject({
			entityId: "notice",
			actorId: null,
			targetId: null,
			readAt: "2026-01-03T00:00:00.000Z",
		});
		expect(result.privateProvenance.Notification[0]?.content).toBe(
			"private-content",
		);
		expect(JSON.stringify(result.rows)).not.toContain("secret@example.test");
		expect(result.privateProvenance.Media[0]?.type).toBe("mainVideo");
	});
	test("requires every original and verified versioned object", () => {
		const source = input();
		const good = options(source);
		expect(() =>
			projectBusiness(source, { ...good, uploaded: good.uploaded.slice(0, 1) }),
		).toThrow();
		for (const change of [
			{ bucket: "other" },
			{ objectKey: "wrong" },
			{ versionId: "" },
			{ sha256: "" },
		]) {
			expect(() =>
				projectBusiness(source, {
					...good,
					uploaded: [
						{ ...good.uploaded[0]!, ...change },
						...good.uploaded.slice(1),
					],
				}),
			).toThrow();
		}
	});
	test("constructs owner-only delivery and rejected private original rows", () => {
		const source = input();
		source.User[0]!.image =
			"https://res.cloudinary.com/demo/image/upload/avatar.jpg";
		const result = projectBusiness(source, options(source));
		const assets = result.rows.filter((r) => r.table === "media_assets");
		expect(assets).toHaveLength(4);
		expect(
			assets.every((r) => r.permissions.join() === 'read("user:user")'),
		).toBe(true);
		expect(assets.filter((r) => r.data.state === "REJECTED")).toHaveLength(2);
		expect(result.rows.find((r) => r.table === "media")?.data).toMatchObject({
			type: "mainVideo",
			state: "READY",
			mimetype: "image/webp",
			checksum: "a".repeat(64),
		});
		expect(JSON.stringify(result.rows)).not.toContain("cloudinary");
	});
	test("rejects multiple source media for the same post and kind", () => {
		const source = input();
		source.Media.push({ ...source.Media[0]!, id: "other" });
		expect(() => options(source)).toThrow();
	});
});
