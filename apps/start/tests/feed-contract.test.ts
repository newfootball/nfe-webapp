import { expect, test } from "bun:test";
import { authorDTO, postDTO } from "../src/lib/feed-contract";

const author = {
	$id: "a",
	name: "A",
	image: "private/object-key",
	localisation: null,
	userType: "PLAYER",
	position: [],
	isOnboarded: true,
	createdAt: "2026-01-15T12:34:56.123Z",
	email: "private@example.test",
	birthday: "secret",
};
const post = {
	$id: "p",
	userId: "a",
	slug: "p",
	title: "title",
	description: "text",
	type: null,
	status: "PUBLISHED",
	createdAt: "2026-01-15T12:34:56.123Z",
	updatedAt: "2026-01-15T12:34:56.123Z",
	publishedAt: null,
	expiresAt: null,
	spamScore: "SPAM",
	objectKey: "private",
};
const stats = { likes: 201, comments: 302 };
test("DTO explicitly projects verified public fields and exact counters", () => {
	const result = postDTO(post, authorDTO(author), stats);
	expect(result._count).toEqual({ likes: 201, comments: 302 });
	expect(result.author.image).toBe(null);
	const json = JSON.stringify(result);
	for (const secret of [
		"email",
		"birthday",
		"objectKey",
		"spamScore",
		"private",
	])
		expect(json).not.toContain(secret);
});
test("drafts, missing/negative counters and foreign authors fail closed", () => {
	for (const changes of [{ status: "DRAFT" }, { status: null }])
		expect(() =>
			postDTO({ ...post, ...changes }, authorDTO(author), stats),
		).toThrow();
	for (const changes of [{ likes: -1 }, { comments: 1.2 }, { likes: "1" }])
		expect(() =>
			postDTO(post, authorDTO(author), { ...stats, ...changes }),
		).toThrow();
	expect(() =>
		postDTO(post, authorDTO({ ...author, $id: "b" }), stats),
	).toThrow();
	expect(() => postDTO(post, authorDTO(author), null)).toThrow();
});
