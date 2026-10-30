import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { clearIdentityCache } from "../src/lib/auth-cache";
import { PostRowSchema } from "../src/lib/feed-contract";
import { invalidatePostText } from "../src/lib/post-text-cache";
import { ownPostDTO } from "../src/lib/post-text-contract";
import {
	EditPostTextSchema,
	OwnPostsSchema,
	ownCursor,
	parseOwnCursor,
} from "../src/lib/post-text-input";

const revision = "a".repeat(64);
const edit = {
	id: "legacy.id-1",
	expectedRevision: revision,
	title: "  Équipe  ",
	description: "  Texte  ",
};
describe("owner post text boundary", () => {
	test("trim, bounds, description optional and strict forged fields", () => {
		expect(EditPostTextSchema.parse(edit)).toEqual({
			...edit,
			title: "Équipe",
			description: "Texte",
		});
		expect(
			EditPostTextSchema.parse({ ...edit, description: "   " }).description,
		).toBe("");
		for (const patch of [
			{ title: " " },
			{ title: "x".repeat(201) },
			{ description: "x".repeat(10001) },
			{ expectedRevision: "old" },
			{ id: "../other" },
			...[
				"userId",
				"ownerId",
				"role",
				"status",
				"media",
				"slug",
				"publishedAt",
			].map((key) => ({ [key]: "forged" })),
		])
			expect(EditPostTextSchema.safeParse({ ...edit, ...patch }).success).toBe(
				false,
			);
		expect(
			EditPostTextSchema.safeParse({
				...edit,
				title: "x".repeat(200),
				description: "x".repeat(10000),
			}).success,
		).toBe(true);
	});
	test("bounded list and cursor bound to actor and page size", () => {
		for (const limit of [0, 21, 1.5])
			expect(OwnPostsSchema.safeParse({ limit }).success).toBe(false);
		expect(OwnPostsSchema.safeParse({ ownerId: "B" }).success).toBe(false);
		const cursor = ownCursor(
			"A",
			10,
			"2026-01-01T00:00:00.000Z",
			"legacy.id-1",
		);
		expect(parseOwnCursor({ limit: 10, cursor }, "A")?.id).toBe("legacy.id-1");
		expect(() => parseOwnCursor({ limit: 10, cursor }, "B")).toThrow();
		expect(() => parseOwnCursor({ limit: 1, cursor }, "A")).toThrow();
	});
	test("private status projection cannot widen public DTO or leak private fields", () => {
		for (const status of [
			"DRAFT",
			"PUBLISHED",
			"PENDING",
			"REJECTED",
			"ARCHIVED",
			null,
		] as const) {
			const row = {
				$id: "legacy.id-1",
				userId: "A",
				slug: "unchanged",
				title: "Title",
				description: "Text",
				type: null,
				status,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
				publishedAt: null,
				expiresAt: null,
				validatedAt: null,
				spamScore: "PRIVATE",
				objectKey: "SECRET",
			};
			const dto = ownPostDTO(row, revision);
			expect(dto.status).toBe(status);
			expect(dto.slug).toBe("unchanged");
			expect(JSON.stringify(dto)).not.toContain("PRIVATE");
			expect(JSON.stringify(dto)).not.toContain("SECRET");
			expect(PostRowSchema.safeParse(row).success).toBe(status === "PUBLISHED");
		}
	});
	test("all locale/filter variants invalidate; unrelated queries survive", async () => {
		const q = new QueryClient();
		const keys = [
			["feed", "fr", null, "old"],
			["feed", "en", "A", "new"],
			["post", "fr", "id", "public"],
			["explore", "en", "équipe", "posts"],
			["profile", "A"],
			["own-posts", "B", null],
			["own-post", "A", "id"],
		];
		for (const key of [...keys, ["theme"]])
			q.setQueryData(key, { text: "old" });
		await invalidatePostText(q);
		for (const key of keys)
			expect(q.getQueryState(key)?.isInvalidated).toBe(true);
		expect(q.getQueryState(["theme"])?.isInvalidated).toBe(false);
		await clearIdentityCache(q);
		expect(q.getQueryCache().getAll()).toHaveLength(0);
	});
	test("identity switch cancels an outstanding private query", async () => {
		const q = new QueryClient();
		let done!: (value: string) => void;
		const pending = q
			.fetchQuery({
				queryKey: ["own-posts", "A"],
				queryFn: () =>
					new Promise<string>((resolve) => {
						done = resolve;
					}),
			})
			.catch(() => null);
		await clearIdentityCache(q);
		done("PRIVATE A");
		await pending;
		expect(q.getQueryData(["own-posts", "A"])).toBeUndefined();
	});
});
