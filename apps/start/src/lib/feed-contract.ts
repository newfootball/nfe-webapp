import { z } from "zod";
import { canonicalImage, postMediaPath } from "./media-contract";

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
	matchOpponent: z.string().min(1).max(64).nullish(),
	matchScoreFor: z.number().int().min(0).max(99).nullish(),
	matchScoreAgainst: z.number().int().min(0).max(99).nullish(),
	matchMinute: z.number().int().min(0).max(130).nullish(),
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
	jerseyNumber: z.number().int().min(0).max(99).nullish(),
	clubId: z.string().min(1).max(36).nullish(),
	clubName: z.string().min(1).max(128).nullish(),
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
		jerseyNumber: r.jerseyNumber ?? null,
		club:
			r.clubId || r.clubName
				? { id: r.clubId ?? null, name: r.clubName ?? null }
				: null,
	};
}
export function safeImage(value: string | null) {
	return canonicalImage(value);
}
function matchDTO(p: z.infer<typeof PostRowSchema>) {
	if (
		!p.matchOpponent ||
		p.matchScoreFor == null ||
		p.matchScoreAgainst == null
	)
		return null;
	return {
		opponent: p.matchOpponent,
		scoreFor: p.matchScoreFor,
		scoreAgainst: p.matchScoreAgainst,
		minute: p.matchMinute ?? null,
	};
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
		match: matchDTO(p),
		mediaPreview: postMediaPath(p.$id, "thumbnail"),
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
