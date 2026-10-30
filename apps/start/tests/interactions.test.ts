import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { clearIdentityCache } from "../src/lib/auth-cache";
import { safeReturnPath } from "../src/lib/auth-policy";
import {
	INTERACTION_ATTEMPTS,
	InteractionRevisionConflict,
	retryInteraction,
} from "../src/lib/interactions-concurrency";
import {
	type InteractionState,
	optimisticInteraction,
} from "../src/lib/interactions-contract";
import {
	interactionCursor,
	parseInteractionCursor,
	validateCommentCreate,
	validateCommentDelete,
	validateFavoritePage,
	validateInteractionPair,
} from "../src/lib/interactions-input";

const state: InteractionState = {
	postId: "post",
	viewerId: "a",
	liked: false,
	favorited: false,
	likes: 4,
	comments: 2,
};
describe("interaction boundaries", () => {
	test("rejects forged identity, role, coercion and hidden pagination actors", () => {
		for (const extra of [{ userId: "b" }, { actorId: "b" }, { role: "admin" }])
			expect(
				validateInteractionPair({
					id: "post",
					kind: "like",
					active: true,
					...extra,
				}).valid,
			).toBe(false);
		expect(
			validateInteractionPair({ id: "post", kind: "like", active: "false" })
				.valid,
		).toBe(false);
		expect(validateFavoritePage({ userId: "b" }).valid).toBe(false);
		expect(
			validateCommentDelete({ id: "post", commentId: "comment", userId: "a" })
				.valid,
		).toBe(false);
	});
	test("comment logical request survives retries but content must be bounded and nonempty", () => {
		const requestId = crypto.randomUUID();
		expect(
			validateCommentCreate({ id: "post", requestId, content: " ok " }),
		).toEqual({ valid: true, data: { id: "post", requestId, content: "ok" } });
		for (const content of [" ", "x".repeat(1001)])
			expect(
				validateCommentCreate({ id: "post", requestId, content }).valid,
			).toBe(false);
		expect(validateCommentCreate({ id: "post", content: "ok" }).valid).toBe(
			false,
		);
	});
	test("optimistic desired-state updates are idempotent and never modify comments or favorites counter", () => {
		const liked = optimisticInteraction(state, "like", true);
		expect(liked.likes).toBe(5);
		expect(optimisticInteraction(liked, "like", true)).toEqual(liked);
		expect(optimisticInteraction(liked, "like", false)).toEqual(state);
		expect(optimisticInteraction(state, "favorite", true)).toEqual({
			...state,
			favorited: true,
		});
		expect(state.likes).toBe(4);
	});
	test("account cache clear cancels deferred read and invalidates mutation query ownership, including A to B to A", async () => {
		const client = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			}),
			key = ["interactions", "state", "post"];
		client.setQueryData(key, state);
		const original = client.getQueryCache().find({ queryKey: key });
		let finish!: (v: InteractionState) => void;
		const pending = client
			.fetchQuery({
				queryKey: key,
				queryFn: ({ signal }) =>
					new Promise<InteractionState>((resolve) => {
						finish = (v) => {
							if (!signal.aborted) resolve(v);
							else resolve(state);
						};
					}),
			})
			.catch(() => null);
		await clearIdentityCache(client);
		finish(state);
		await pending;
		expect(client.getQueryData(key)).toBeUndefined();
		client.setQueryData(key, { ...state, viewerId: "b" });
		await clearIdentityCache(client);
		client.setQueryData(key, state);
		expect(client.getQueryCache().find({ queryKey: key })).not.toBe(original);
	});
});

describe("review regression guards", () => {
	test("1000 characters is accepted and 1001 rejected", () => {
		const requestId = crypto.randomUUID();
		expect(
			validateCommentCreate({
				id: "post",
				requestId,
				content: "x".repeat(1000),
			}).valid,
		).toBe(true);
		expect(
			validateCommentCreate({
				id: "post",
				requestId,
				content: "x".repeat(1001),
			}).valid,
		).toBe(false);
	});
	test("business-date cursor is scoped and preserves imported arbitrary IDs", () => {
		const time = "2026-10-30T10:00:00.000Z",
			cursor = interactionCursor("comments:post", time, "legacy-id");
		expect(parseInteractionCursor("comments:post", cursor)).toMatchObject({
			time,
			id: "legacy-id",
		});
		expect(() => parseInteractionCursor("comments:other", cursor)).toThrow();
		expect(() => parseInteractionCursor("comments:post", "bad-json")).toThrow();
	});
	test("concurrent revision retries with a fresh visibility check; revocation never retries", async () => {
		let checks = 0,
			revision = 1;
		const result = await retryInteraction(
			async () => {
				checks++;
				const before = revision;
				if (checks === 1) revision++;
				if (before !== revision) throw new InteractionRevisionConflict();
				return revision;
			},
			(e) => e instanceof InteractionRevisionConflict,
			async () => {},
		);
		expect(result).toBe(2);
		expect(checks).toBe(2);
		let attempts = 0;
		await expect(
			retryInteraction(
				async () => {
					attempts++;
					throw new Error("forbidden");
				},
				(e) => e instanceof InteractionRevisionConflict,
				async () => {},
			),
		).rejects.toThrow("forbidden");
		expect(attempts).toBe(1);
	});
	test("revision contention has a strict attempt bound", async () => {
		let attempts = 0;
		await expect(
			retryInteraction(
				async () => {
					attempts++;
					throw new InteractionRevisionConflict();
				},
				(e) => e instanceof InteractionRevisionConflict,
				async () => {},
			),
		).rejects.toBeInstanceOf(InteractionRevisionConflict);
		expect(attempts).toBe(INTERACTION_ATTEMPTS);
	});
	test("new return paths remain locale-local, bounded, and cannot redirect externally", () => {
		expect(safeReturnPath("/en/profile/favorites", "en")).toBe(
			"/en/profile/favorites",
		);
		expect(safeReturnPath("/en/post/legacy-post", "en")).toBe(
			"/en/post/legacy-post",
		);
		for (const path of [
			"//evil.test",
			"https://evil.test/en/post/id",
			"/fr/post/id",
			"/en/post/../private",
			"/en/post/id?next=https://evil.test",
			"/en/post/id/other",
		])
			expect(safeReturnPath(path, "en")).toBe("/en/private");
	});
});
