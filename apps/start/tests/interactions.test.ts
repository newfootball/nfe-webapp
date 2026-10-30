import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { clearIdentityCache } from "../src/lib/auth-cache";
import {
	type InteractionState,
	optimisticInteraction,
} from "../src/lib/interactions-contract";
import {
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
		for (const content of [" ", "x".repeat(5001)])
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
