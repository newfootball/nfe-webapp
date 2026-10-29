import { describe, expect, test } from "bun:test";
import {
	decodeCursor,
	encodeCursor,
	FeedRequestSchema,
	foldSearch,
} from "../src/lib/feed-input";

describe("public feed request boundary", () => {
	test("normalizes canonical Unicode while preserving substring accents", () => {
		expect(foldSearch("E\u0301QUIPE")).toBe("équipe");
		expect(FeedRequestSchema.parse({ q: "  ARIS  " }).q).toBe("aris");
	});
	test("rejects forged controls and excessive work", () => {
		for (const input of [
			{ limit: 0 },
			{ limit: 21 },
			{ status: "DRAFT" },
			{ viewerId: "a" },
			{ q: "a".repeat(129) },
			{ authorId: "../a" },
		])
			expect(FeedRequestSchema.safeParse(input).success).toBe(false);
	});
	test("versioned cursor is bound to exact filter and page size", () => {
		const input = FeedRequestSchema.parse({
			authorId: "author",
			q: "ÉQUIPE",
			limit: 2,
		});
		const cursor = encodeCursor(input, "2026-01-15T12:34:56.123Z", "post-2");
		expect(decodeCursor({ ...input, cursor })?.id).toBe("post-2");
		for (const change of [{ q: "paris" }, { authorId: "other" }, { limit: 10 }])
			expect(() => decodeCursor({ ...input, ...change, cursor })).toThrow();
		for (const bad of [
			"%",
			"{}",
			encodeURIComponent(JSON.stringify({ v: 2 })),
			encodeURIComponent(
				JSON.stringify({ v: 1, filter: "x", time: null, id: "post" }),
			),
		])
			expect(() => decodeCursor({ ...input, cursor: bad })).toThrow();
	});
});
