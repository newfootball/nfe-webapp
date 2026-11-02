import { z } from "zod";
import { readPrivate } from "../identity-import/source";

const id = z.string().min(1);
const text = z.string();
const nullableText = text.nullable();
// PostgreSQL JSON exports use ISO timestamps; retain the original string exactly.
// PostgreSQL timestamp without time zone exports have no suffix. The target
// projection must explicitly interpret these Prisma timestamps as UTC later.
const date = z.iso.datetime({ offset: true, local: true });
const nullableDate = date.nullable();
const timestamps = { createdAt: date, updatedAt: date };
const position = z.enum([
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
]);
const json: z.ZodType<unknown> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(json),
		z.record(z.string(), json),
	]),
);
const user = z.strictObject({
	id,
	name: nullableText,
	email: nullableText,
	emailVerified: z.boolean(),
	image: nullableText,
	birthday: nullableDate,
	fullName: nullableText,
	biography: nullableText,
	position: z.array(position).nullable(),
	foot: z.array(z.enum(["LEFT", "RIGHT"])).nullable(),
	license: nullableText,
	contract: nullableText,
	size: z.number().int().nullable(),
	weight: z.number().int().nullable(),
	localisation: nullableText,
	gender: z.enum(["male", "female"]).nullable(),
	role: z.enum(["USER", "ADMIN"]),
	userType: z.enum(["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"]),
	isOnboarded: z.boolean(),
	createdAt: date,
	updatedAt: nullableDate,
});
const post = z.strictObject({
	id,
	slug: text,
	userId: id,
	title: text,
	type: z.enum(["video", "shortVideo"]).nullable(),
	status: z
		.enum(["DRAFT", "PUBLISHED", "REJECTED", "PENDING", "ARCHIVED"])
		.nullable(),
	description: text,
	spamScore: z.enum(["NONE", "SUSPECT", "SPAM"]).nullable(),
	...timestamps,
	expiresAt: nullableDate,
	validatedAt: nullableDate,
	publishedAt: nullableDate,
});
const pair = { id, userId: id, postId: id, ...timestamps };
const tablesSchema = z.strictObject({
	User: z.array(user),
	Account: z.array(
		z.strictObject({
			id,
			userId: id,
			providerId: text,
			accountId: text,
			...timestamps,
		}),
	),
	Post: z.array(post),
	Media: z.array(
		z.strictObject({
			id,
			type: z.enum(["landingImage", "mainVideo", "shortVideo"]),
			postId: id,
			mimetype: text,
			url: text,
			filename: nullableText,
			label: nullableText,
			metadata: json,
			...timestamps,
		}),
	),
	Follow: z.array(
		z.strictObject({ id, followerId: id, followingId: id, ...timestamps }),
	),
	Like: z.array(z.strictObject(pair)),
	Favorite: z.array(z.strictObject(pair)),
	Comment: z.array(z.strictObject({ ...pair, content: text })),
	Message: z.array(
		z.strictObject({
			id,
			fromUserId: id,
			toUserId: id,
			content: text,
			readAt: nullableDate,
			...timestamps,
		}),
	),
	Notification: z.array(
		z.strictObject({
			id,
			userId: id,
			type: z.enum(["COMMENT", "LIKE", "FOLLOW", "MESSAGE"]),
			content: text,
			link: nullableText,
			readAt: nullableDate,
			...timestamps,
		}),
	),
	PostSignal: z.array(
		z.strictObject({
			...pair,
			reason: z.enum([
				"INAPPROPRIATE",
				"SPAM",
				"OFFENSIVE",
				"MISLEADING",
				"OTHER",
			]),
			details: nullableText,
			status: z.enum(["PENDING", "REVIEWED", "DISMISSED"]),
		}),
	),
});
export const snapshotSchema = z.strictObject({
	version: z.literal(1),
	tables: tablesSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type BusinessSource = Omit<Snapshot["tables"], "Account">;

function unique(values: string[]): boolean {
	return new Set(values).size === values.length;
}
function validateRelations(t: Snapshot["tables"]): boolean {
	for (const rows of Object.values(t))
		if (!unique(rows.map((row) => row.id))) return false;
	if (
		!unique(t.User.flatMap((u) => (u.name === null ? [] : [u.name]))) ||
		!unique(t.User.flatMap((u) => (u.email === null ? [] : [u.email]))) ||
		!unique(t.Post.map((p) => p.slug))
	)
		return false;
	const key = (...parts: string[]) => JSON.stringify(parts);
	if (
		!unique(t.Account.map((a) => key(a.providerId, a.accountId))) ||
		!unique(t.Follow.map((f) => key(f.followerId, f.followingId)))
	)
		return false;
	for (const rows of [t.Like, t.Favorite, t.PostSignal])
		if (!unique(rows.map((r) => key(r.postId, r.userId)))) return false;
	const users = new Set(t.User.map((u) => u.id));
	const posts = new Set(t.Post.map((p) => p.id));
	return (
		t.Account.every((a) => users.has(a.userId)) &&
		t.Post.every((p) => users.has(p.userId)) &&
		t.Media.every((m) => posts.has(m.postId)) &&
		t.Follow.every(
			(f) => users.has(f.followerId) && users.has(f.followingId),
		) &&
		[t.Like, t.Favorite, t.Comment, t.PostSignal].every((rows) =>
			rows.every((r) => users.has(r.userId) && posts.has(r.postId)),
		) &&
		t.Message.every((m) => users.has(m.fromUserId) && users.has(m.toUserId)) &&
		t.Notification.every((n) => users.has(n.userId))
	);
}

// Never include field values, IDs, or validation diagnostics in errors or reports.
export function projectSource(input: unknown): {
	source: BusinessSource;
	report: Record<keyof BusinessSource, number>;
} {
	const parsed = snapshotSchema.safeParse(input);
	if (!parsed.success || !validateRelations(parsed.data.tables))
		throw new Error("invalid_source_projection");
	const { Account: _account, ...source } = parsed.data.tables;
	const report = Object.fromEntries(
		Object.entries(source).map(([name, rows]) => [name, rows.length]),
	) as Record<keyof BusinessSource, number>;
	return { source, report };
}
export async function readSource(path: string, authorized: boolean) {
	if (!authorized) throw new Error("source_authorization_required");
	return projectSource(await readPrivate(path));
}
