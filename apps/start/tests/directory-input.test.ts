import { expect, test } from "bun:test";
import { DirectorySchema, directoryTitle } from "../src/lib/directory-input";

test("public directory inputs restrict types, filters and bounded pagination", () => {
	for (const value of [
		{ type: "admin" },
		{ type: "players", page: 51 },
		{ type: "players", page: 0 },
		{ type: "players", page: 1.5 },
		{ type: "clubs", position: "goalkeeper" },
		{ type: "players", city: "unknown" },
		{ type: "players", readerKey: "injected" },
	])
		expect(DirectorySchema.safeParse(value).success).toBe(false);
	expect(
		directoryTitle(
			"fr",
			DirectorySchema.parse({ type: "players", position: "goalkeeper" }),
		),
	).toBe("Gardiens de but");
	expect(
		directoryTitle(
			"en",
			DirectorySchema.parse({ type: "players", city: "paris" }),
		),
	).toBe("Players in Paris");
});
