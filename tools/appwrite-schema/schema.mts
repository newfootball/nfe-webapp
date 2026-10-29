// v1: derived from prisma/schema.prisma and src/query/*.query.ts, not Prisma DTOs.
export type Column = {
	type: "string" | "integer" | "boolean" | "datetime" | "enum";
	required: boolean;
	size?: number;
	array?: boolean;
	elements?: string[];
};
const s = (required = true, size = 255): Column => ({
	type: "string",
	required,
	size,
});
const date = (required = true): Column => ({ type: "datetime", required });
const en = (elements: string[], required = true, array = false): Column => ({
	type: "enum",
	required,
	elements,
	array,
});
const integer = (required = false): Column => ({ type: "integer", required });
const bool = (): Column => ({ type: "boolean", required: true });
const times = { createdAt: date(), updatedAt: date() };
const edge = { userId: s(), postId: s(), ...times };
export const enums = {
	SpamScore: ["NONE", "SUSPECT", "SPAM"],
	UserType: ["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"],
	Position: [
		"GOALKEEPER",
		"CENTRE_BACK",
		"RIGHT_BACK",
		"LEFT_BACK",
		"DEFENSIVE_MIDFIELDER",
		"CENTRE_MIDFIELDER",
		"ATTACKING_MIDFIELDER",
		"RIGHT_WINGER",
		"LEFT_WINGER",
		"CENTRE_FORWARD",
		"STRIKER",
	],
	Foot: ["LEFT", "RIGHT"],
	Role: ["USER", "ADMIN"],
	Gender: ["male", "female"],
	MediaType: ["landingImage", "mainVideo", "shortVideo"],
	PostType: ["video", "shortVideo"],
	PostStatus: ["DRAFT", "PUBLISHED", "REJECTED", "PENDING", "ARCHIVED"],
	SignalReason: ["INAPPROPRIATE", "SPAM", "OFFENSIVE", "MISLEADING", "OTHER"],
	SignalStatus: ["PENDING", "REVIEWED", "DISMISSED"],
	NotificationType: ["COMMENT", "LIKE", "FOLLOW", "MESSAGE"],
};
export type Index = { key: string; columns: string[]; type: "key" | "unique" };
const ix = (key: string, columns: string[], unique = false): Index => ({
	key,
	columns,
	type: unique ? "unique" : "key",
});
export type Table = { columns: Record<string, Column>; indexes: Index[] };
export const tables: Record<string, Table> = {
	profiles: {
		columns: {
			name: s(false, 128),
			nameFolded: s(false, 128),
			image: s(false, 2048),
			biography: s(false, 65535),
			position: en(enums.Position, true, true),
			foot: en(enums.Foot, true, true),
			localisation: s(false),
			userType: en(enums.UserType),
			isOnboarded: bool(),
			createdAt: date(),
			updatedAt: date(false),
		},
		indexes: [
			ix("name_unique", ["name"], true),
			ix("name_search", ["nameFolded"]),
			ix("onboarded_created", ["isOnboarded", "createdAt"]),
			ix("type_onboarded", ["userType", "isOnboarded"]),
			ix("updated", ["updatedAt"]),
		],
	},
	private_profiles: {
		columns: {
			birthday: date(false),
			fullName: s(false),
			license: s(false),
			contract: s(false),
			size: integer(),
			weight: integer(),
			gender: en(enums.Gender, false),
			role: en(enums.Role),
		},
		indexes: [],
	},
	follows: {
		columns: { followerId: s(), followingId: s(), ...times },
		indexes: [
			ix("follow_pair", ["followerId", "followingId"], true),
			ix("follower_created", ["followerId", "createdAt"]),
			ix("following_created", ["followingId", "createdAt"]),
		],
	},
	posts: {
		columns: {
			slug: s(true, 128),
			userId: s(),
			title: s(true, 1024),
			titleFolded: s(true, 1024),
			description: s(true, 65535),
			descriptionFolded: s(true, 65535),
			type: en(enums.PostType, false),
			status: en(enums.PostStatus, false),
			...times,
			expiresAt: date(false),
			validatedAt: date(false),
			publishedAt: date(false),
		},
		indexes: [
			ix("slug_unique", ["slug"], true),
			ix("user_created", ["userId", "createdAt"]),
			ix("status_created", ["status", "createdAt"]),
			ix("status_published", ["status", "publishedAt"]),
		],
	},
	post_private: {
		columns: { spamScore: en(enums.SpamScore, false) },
		indexes: [],
	},
	media: {
		columns: {
			type: en(enums.MediaType),
			postId: s(),
			mimetype: s(),
			filename: s(false),
			label: s(false),
			metadataJson: s(false, 65535),
			...times,
			provider: en(["B2"]),
			bucket: s(),
			objectKey: s(true, 1024),
			versionId: s(false),
			byteSize: integer(true),
			checksum: s(),
			ownerId: s(),
			state: en(["PENDING", "READY", "QUARANTINED", "DELETED"]),
		},
		indexes: [ix("post", ["postId"]), ix("owner_state", ["ownerId", "state"])],
	},
	likes: {
		columns: edge,
		indexes: [
			ix("like_pair", ["postId", "userId"], true),
			ix("user_created", ["userId", "createdAt"]),
		],
	},
	favorites: {
		columns: edge,
		indexes: [
			ix("favorite_pair", ["postId", "userId"], true),
			ix("user_created", ["userId", "createdAt"]),
		],
	},
	comments: {
		columns: { ...edge, content: s(true, 65535) },
		indexes: [ix("post_created", ["postId", "createdAt"])],
	},
	notifications: {
		columns: {
			userId: s(),
			type: en(enums.NotificationType),
			content: s(true, 65535),
			link: s(false, 2048),
			readAt: date(false),
			...times,
		},
		indexes: [
			ix("user_created", ["userId", "createdAt"]),
			ix("user_read", ["userId", "readAt"]),
		],
	},
	messages: {
		columns: {
			fromUserId: s(),
			toUserId: s(),
			content: s(true, 65535),
			readAt: date(false),
			...times,
		},
		indexes: [
			ix("conversation", ["fromUserId", "toUserId", "createdAt"]),
			ix("sender_created", ["fromUserId", "createdAt"]),
			ix("recipient_created", ["toUserId", "createdAt"]),
		],
	},
	signals: {
		columns: {
			...edge,
			reason: en(enums.SignalReason),
			details: s(false, 65535),
			status: en(enums.SignalStatus),
		},
		indexes: [
			ix("signal_pair", ["postId", "userId"], true),
			ix("status_created", ["status", "createdAt"]),
			ix("post", ["postId"]),
		],
	},
	schema_versions: { columns: { digest: s(), appliedAt: date() }, indexes: [] },
};
export const schemaVersion = "v1";
export const schemaDigest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(tables))
	.digest("hex");
export const fold = (value: string) =>
	value.normalize("NFC").toLocaleLowerCase("fr");
