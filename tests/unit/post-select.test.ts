import { describe, expect, it } from "bun:test";
import {
	POST_PUBLIC_USER_SELECT,
	POST_WITH_PUBLIC_USER_INCLUDE,
} from "@/src/query/post.select";

describe("post public user select", () => {
	it("keeps post authors limited to public profile fields", () => {
		expect(POST_PUBLIC_USER_SELECT).toEqual({
			id: true,
			name: true,
			image: true,
			localisation: true,
		});
	});

	it("does not include sensitive user fields through post queries", () => {
		const selectedFields = Object.keys(
			POST_WITH_PUBLIC_USER_INCLUDE.user.select,
		);

		expect(selectedFields).not.toContain("email");
		expect(selectedFields).not.toContain("password");
		expect(selectedFields).not.toContain("resetToken");
	});
});
