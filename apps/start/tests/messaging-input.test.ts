import { describe, expect, test } from "bun:test";
import { messageDTO, messageEvent } from "../src/lib/messaging-contract";
import {
	MarkReadSchema,
	MessagePageSchema,
	messageCursor,
	parseMessageCursor,
	SendMessageSchema,
} from "../src/lib/messaging-input";

const requestId = "5ada8dad-5622-4e60-b5f3-b9276afc637f";
describe("messaging boundary", () => {
	test("bounds content, denies identity injection and accepts synthetic/imported IDs", () => {
		for (const content of ["", "   ", "x".repeat(2001)])
			expect(
				SendMessageSchema.safeParse({
					toUserId: "imported_1998.a",
					content,
					requestId,
				}).success,
			).toBe(false);
		expect(
			SendMessageSchema.parse({
				toUserId: "imported_1998.a",
				content: " hello ",
				requestId,
			}).content,
		).toBe("hello");
		expect(
			SendMessageSchema.safeParse({
				toUserId: "B",
				content: "hello",
				requestId,
				fromUserId: "C",
			}).success,
		).toBe(false);
		expect(
			MarkReadSchema.safeParse({ ids: Array(31).fill("id") }).success,
		).toBe(false);
	});
	test("cursor is bound to owner, peer, search and page size", () => {
		const input = MessagePageSchema.parse({ peerId: "B" });
		const cursor = messageCursor(
			input,
			"A",
			"1998-07-12T12:00:00.000Z",
			"imported.1",
		);
		expect(parseMessageCursor({ ...input, cursor }, "A")?.id).toBe(
			"imported.1",
		);
		for (const change of [{ peerId: "C" }, { q: "leak" }, { limit: 30 }])
			expect(() =>
				parseMessageCursor({ ...input, ...change, cursor }, "A"),
			).toThrow();
		expect(() => parseMessageCursor({ ...input, cursor }, "B")).toThrow();
	});
	test("participant projection preserves business dates and excludes private metadata", () => {
		const row = {
			$id: "legacy.1",
			fromUserId: "B",
			toUserId: "A",
			content: "history",
			createdAt: "1998-07-12T12:00:00+00:00",
			updatedAt: "1998-07-12T12:00:00Z",
			readAt: null,
			secret: "never",
			$permissions: [],
		};
		const dto = messageDTO(row, "A");
		expect(dto.createdAt).toBe("1998-07-12T12:00:00.000Z");
		expect(dto).not.toHaveProperty("secret");
		expect(() => messageDTO(row, "admin")).toThrow();
		expect(messageEvent(dto)).toEqual({
			version: 1,
			type: "MESSAGE",
			eventId: "message:legacy.1",
			actorId: "B",
			recipientId: "A",
			messageId: "legacy.1",
			occurredAt: "1998-07-12T12:00:00.000Z",
		});
	});
});

test("messaging sign-in returnTo accepts only locale-scoped paths", async () => {
	const { safeReturnPath } = await import("../src/lib/auth-policy");
	for (const path of ["/fr/messages", "/fr/messages/imported.1"])
		expect(safeReturnPath(path, "fr")).toBe(path);
	for (const path of [
		"/en/messages/B",
		"https://evil.test/fr/messages/B",
		"//evil.test",
		"/fr/messages/../private",
		"/fr/messages/B?q=x",
		"/fr/messages/%2e%2e",
		"/fr/messages/B%2fC",
		"/fr/messages/.hidden",
	])
		expect(safeReturnPath(path, "fr")).toBe("/fr/private");
});
