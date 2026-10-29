// Every scalar source field has an explicit destination or deliberate retirement.
const fields = (table: string, names: string) =>
	Object.fromEntries(names.split(" ").map((key) => [key, `${table}.${key}`]));
const id = { id: "$id (unchanged)" };
const times = "createdAt updatedAt";
const edge = { ...id, ...fields("same", `userId postId ${times}`) };
export const mapping: Record<string, Record<string, string>> = {
	User: {
		...id,
		...fields(
			"profiles",
			`name image biography position foot localisation userType isOnboarded ${times}`,
		),
		...fields(
			"private_profiles",
			"birthday fullName license contract size weight gender role",
		),
		email:
			"Auth.email (nullable email-less users require explicit migration policy)",
		emailVerified: "Auth.emailVerification",
		password: "Auth bcrypt import, never business rows",
		resetToken: "retired: invalidate legacy reset tokens",
		resetTokenExpiry: "retired with resetToken",
	},
	Post: {
		...id,
		...fields(
			"posts",
			`slug userId title type status description ${times} expiresAt validatedAt publishedAt`,
		),
		spamScore: "post_private.spamScore",
	},
	Media: {
		...id,
		...fields("media", `type postId mimetype filename label ${times}`),
		url: "resolve legacy URL to private B2 bucket/objectKey/versionId; reject unresolved or signed URL",
		metadata:
			"media.metadataJson: lossless JSON.stringify / JSON.parse, SQL null stays null",
	},
	Follow: { ...id, ...fields("follows", `followerId followingId ${times}`) },
	Like: edge,
	Favorite: edge,
	Comment: { ...edge, content: "comments.content" },
	Notification: {
		...id,
		...fields("notifications", `userId type content link readAt ${times}`),
	},
	Message: {
		...id,
		...fields("messages", `fromUserId toUserId content readAt ${times}`),
	},
	PostSignal: { ...edge, ...fields("signals", "reason details status") },
	Account: Object.fromEntries(
		`id userId accountId providerId accessToken refreshToken accessTokenExpiresAt refreshTokenExpiresAt scope idToken password ${times}`
			.split(" ")
			.map((key) => [
				key,
				"Auth migration only: OAuth reconsent, no business copy of tokens; legacy ID audit mapping",
			]),
	),
	Session: Object.fromEntries(
		`id userId token expiresAt ipAddress userAgent ${times}`
			.split(" ")
			.map((key) => [
				key,
				"Invalidate: force fresh Appwrite sessions; no token/IP/user-agent copy",
			]),
	),
	Verification: Object.fromEntries(
		`id identifier value expiresAt ${times}`
			.split(" ")
			.map((key) => [
				key,
				"Invalidate legacy verification secrets; issue fresh Auth challenge",
			]),
	),
};

export type PublicProfileDTO = {
	id: string;
	name: string | null;
	image: string | null;
	biography: string | null;
	position: string[];
	foot: string[];
	localisation: string | null;
	userType: string;
	isOnboarded: boolean;
	createdAt: string;
	updatedAt: string | null;
};
// This explicit allowlist never spreads a private/Auth row into a public response.
export function publicProfile(row: Record<string, unknown>): PublicProfileDTO {
	return {
		id: String(row.$id),
		name: row.name as string | null,
		image: row.image as string | null,
		biography: row.biography as string | null,
		position: row.position as string[],
		foot: row.foot as string[],
		localisation: row.localisation as string | null,
		userType: String(row.userType),
		isOnboarded: row.isOnboarded === true,
		createdAt: String(row.createdAt),
		updatedAt: row.updatedAt as string | null,
	};
}
