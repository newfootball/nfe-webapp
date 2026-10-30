import { expect, test } from "bun:test";
import { optimisticFollow } from "../src/lib/follow-contract";
import {
	validateFollowList,
	validateFollowState,
	validateFollowTarget,
} from "../src/lib/follow-input";

test("follow boundary rejects forged identity, role and non-boolean state", () => {
	for (const extra of [
		{ followerId: "A" },
		{ userId: "A" },
		{ role: "admin" },
		{ following: "false" },
		{ permissions: [] },
	])
		expect(
			validateFollowState({ id: "B", following: true, ...extra }).valid,
		).toBe(false);
	for (const id of ["", "../private", "x".repeat(37)])
		expect(validateFollowTarget({ id }).valid).toBe(false);
	expect(validateFollowState({ id: "B", following: false })).toEqual({
		valid: true,
		data: { id: "B", following: false },
	});
});
test("private list accepts no foreign owner and bounds its cursor", () => {
	expect(
		validateFollowList({ direction: "following", userId: "B" }).valid,
	).toBe(false);
	expect(
		validateFollowList({ direction: "followers", cursor: "../../secret" })
			.valid,
	).toBe(false);
	expect(validateFollowList({ direction: "followers" })).toEqual({
		valid: true,
		data: { direction: "followers", cursor: null },
	});
});
test("optimistic desired-state counters are idempotent and reversible", () => {
	const original = {
		targetId: "B",
		viewerId: "A",
		following: false,
		followers: 4,
		followings: 3,
	};
	const following = optimisticFollow(original, true);
	expect(following).toEqual({ ...original, following: true, followers: 5 });
	expect(optimisticFollow(following, true)).toEqual(following);
	expect(optimisticFollow(following, false)).toEqual(original);
	expect(original.followers).toBe(4);
});
