import { describe, expect, it } from "bun:test";
import { createUniquePostSlug, slugifyPostTitle } from "@/src/lib/post-slug";

describe("post slug helpers", () => {
	it("normalizes titles into URL-safe slugs", () => {
		expect(slugifyPostTitle("Été 2026: Skills & Highlights!")).toBe(
			"ete-2026-skills-highlights",
		);
	});

	it("falls back to a generic slug when the title has no usable characters", () => {
		expect(slugifyPostTitle("!!!")).toBe("post");
	});

	it("increments the slug while collisions exist", async () => {
		const existingSlugs = new Set(["my-goal", "my-goal-1"]);

		const slug = await createUniquePostSlug("My goal", async (candidate) =>
			existingSlugs.has(candidate),
		);

		expect(slug).toBe("my-goal-2");
	});
});
