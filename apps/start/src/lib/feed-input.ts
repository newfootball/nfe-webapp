import { z } from "zod";

export const FeedIdSchema = z
	.string()
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/);
export const foldSearch = (value: string) =>
	value.normalize("NFC").toLocaleLowerCase("fr");
export const SearchTextSchema = z
	.string()
	.max(128)
	.transform((v) => foldSearch(v.trim()));
export const FeedRequestSchema = z.strictObject({
	authorId: FeedIdSchema.optional(),
	q: SearchTextSchema.default(""),
	limit: z.number().int().min(1).max(20).default(10),
	cursor: z.string().max(2500).nullable().default(null),
});
export const ExploreRequestSchema = z.strictObject({
	q: SearchTextSchema.default(""),
	tab: z.enum(["top", "users", "posts"]).default("top"),
});
export const DetailRequestSchema = z.strictObject({ id: FeedIdSchema });
export type FeedRequest = z.infer<typeof FeedRequestSchema>;
export type ExploreRequest = z.infer<typeof ExploreRequestSchema>;
const CursorSchema = z.strictObject({
	v: z.literal(1),
	filter: z.string().max(1000),
	time: z.iso.datetime({ precision: 3 }).nullable(),
	id: FeedIdSchema,
});
export type FeedCursor = z.infer<typeof CursorSchema>;
export function filterIdentity(input: FeedRequest) {
	return JSON.stringify([
		"PUBLISHED",
		input.authorId ?? null,
		input.q,
		input.q ? "publishedAt" : "createdAt",
		input.limit,
	]);
}
export function encodeCursor(
	input: FeedRequest,
	time: string | null,
	id: string,
) {
	return encodeURIComponent(
		JSON.stringify({ v: 1, filter: filterIdentity(input), time, id }),
	);
}
export function decodeCursor(input: FeedRequest): FeedCursor | null {
	if (!input.cursor) return null;
	const cursor = CursorSchema.parse(
		JSON.parse(decodeURIComponent(input.cursor)),
	);
	if (
		cursor.filter !== filterIdentity(input) ||
		(!input.q && cursor.time === null)
	)
		throw new Error("Invalid cursor filter");
	return cursor;
}
