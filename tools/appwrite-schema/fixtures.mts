import { fold } from "./schema.mts";

export const ids = {
	a: "cfixtureusera0000000000001",
	b: "cfixtureuserb0000000000002",
	admin: "cfixtureadmin000000000001",
};
export const timestamp = "2026-01-15T12:34:56.123Z";
export const times = { createdAt: timestamp, updatedAt: timestamp };
export function profile(name: string | null) {
	return {
		name,
		nameFolded: name === null ? null : fold(name),
		image: null,
		biography: null,
		position: ["STRIKER", "LEFT_WINGER"],
		foot: ["RIGHT"],
		localisation: "Paris",
		userType: "PLAYER",
		isOnboarded: true,
		createdAt: timestamp,
		updatedAt: null,
	};
}
export function post(slug: string, status: string | null = "PUBLISHED") {
	return {
		slug,
		userId: ids.a,
		title: "Équipe Paris",
		titleFolded: fold("Équipe Paris"),
		description: "Une démonstration",
		descriptionFolded: fold("Une démonstration"),
		type: null,
		status,
		...times,
		expiresAt: null,
		validatedAt: null,
		publishedAt: status === "PUBLISHED" ? timestamp : null,
	};
}
export const fixtures: {
	table: string;
	id: string;
	data: Record<string, unknown>;
}[] = [
	{ table: "profiles", id: ids.a, data: profile("fixture-a") },
	{ table: "profiles", id: ids.b, data: profile("fixture-b") },
	{ table: "profiles", id: ids.admin, data: profile("fixture-admin") },
	{
		table: "private_profiles",
		id: ids.a,
		data: {
			birthday: "2000-04-01T00:00:00.000Z",
			fullName: "Private fixture",
			license: null,
			contract: null,
			size: null,
			weight: 75,
			gender: null,
			role: "USER",
		},
	},
	...(
		["PUBLISHED", "DRAFT", "REJECTED", "PENDING", "ARCHIVED", null] as const
	).map((status, i) => ({
		table: "posts",
		id: `post-${i}`,
		data: post(`fixture-post-${i}`, status),
	})),
	{ table: "post_private", id: "post-0", data: { spamScore: "NONE" } },
	{
		table: "follows",
		id: "follow-ab",
		data: { followerId: ids.a, followingId: ids.b, ...times },
	},
	{
		table: "likes",
		id: "like-a",
		data: { userId: ids.a, postId: "post-0", ...times },
	},
	{
		table: "favorites",
		id: "favorite-a",
		data: { userId: ids.a, postId: "post-0", ...times },
	},
	{
		table: "comments",
		id: "comment-a",
		data: {
			userId: ids.a,
			postId: "post-0",
			content: "Reference comment",
			...times,
		},
	},
	{
		table: "notifications",
		id: "notification-a",
		data: {
			userId: ids.a,
			type: "COMMENT",
			content: "Reference notification",
			link: null,
			readAt: null,
			...times,
		},
	},
	{
		table: "messages",
		id: "message-ab",
		data: {
			fromUserId: ids.a,
			toUserId: ids.b,
			content: "Participants only",
			readAt: null,
			...times,
		},
	},
	{
		table: "messages",
		id: "message-admin",
		data: {
			fromUserId: ids.admin,
			toUserId: ids.admin,
			content: "Unrelated conversation",
			readAt: null,
			...times,
		},
	},
	{
		table: "signals",
		id: "signal-a",
		data: {
			userId: ids.a,
			postId: "post-0",
			reason: "SPAM",
			details: null,
			status: "PENDING",
			...times,
		},
	},
	{
		table: "media",
		id: "media-a",
		data: {
			postId: "post-0",
			type: "mainVideo",
			mimetype: "video/mp4",
			filename: null,
			label: null,
			metadataJson: JSON.stringify({ duration: 3.5 }),
			...times,
			provider: "B2",
			bucket: "synthetic-private",
			objectKey: "posts/post-0/original.mp4",
			versionId: null,
			byteSize: 1024,
			checksum: "sha256:synthetic-fixture-only",
			ownerId: ids.a,
			state: "READY",
		},
	},
];
