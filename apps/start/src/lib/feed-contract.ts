import { z } from "zod";

const isoDate = z.string().transform((v) => new Date(v).toISOString());
const nullableText = z.string().nullable();
export const PostRowSchema = z.object({
	$id: z.string(),
	userId: z.string(),
	slug: z.string(),
	title: z.string(),
	description: z.string(),
	type: nullableText,
	status: z.literal("PUBLISHED"),
	createdAt: isoDate,
	updatedAt: isoDate,
	publishedAt: isoDate.nullable(),
	expiresAt: isoDate.nullable(),
});
export const CountsSchema = z.strictObject({
	likes: z.number().int().nonnegative(),
	comments: z.number().int().nonnegative(),
});
export const AuthorRowSchema = z.object({
	$id: z.string(),
	name: nullableText,
	image: nullableText,
	localisation: nullableText,
	userType: z.string(),
	position: z.array(z.string()),
	isOnboarded: z.literal(true),
	createdAt: z.string(),
});
export function authorDTO(value: unknown) {
	const r = AuthorRowSchema.parse(value);
	return {
		id: r.$id,
		name: r.name,
		image: safeImage(r.image),
		localisation: r.localisation,
		userType: r.userType,
		position: r.position,
	};
}
// #55 owns real media resolution. Only known public fixture assets are permitted here.
export function safeImage(value: string | null) {
	return value === "/logo.svg" ? value : null;
}
export function postDTO(
	value: unknown,
	author: ReturnType<typeof authorDTO>,
	stats: unknown,
) {
	const p = PostRowSchema.parse(value),
		s = CountsSchema.parse(stats);
	if (author.id !== p.userId) throw new Error("Inconsistent post snapshot");
	return {
		id: p.$id,
		userId: p.userId,
		slug: p.slug,
		title: p.title,
		description: p.description,
		type: p.type,
		status: p.status,
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
		publishedAt: p.publishedAt,
		expiresAt: p.expiresAt,
		author,
		mediaPreview: "/logo.svg",
		_count: { likes: s.likes, comments: s.comments },
	};
}
export type PublicPost = ReturnType<typeof postDTO>;
export type FeedPage = { posts: PublicPost[]; nextCursor: string | null };
export type ExploreUser = ReturnType<typeof authorDTO> & {
	_count: { posts: number; followeds: number };
};
export type ExploreResult = { users: ExploreUser[]; posts: PublicPost[] };
export type FeedResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: "invalid" | "unavailable" };
