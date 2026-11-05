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
test("home-v1 identity and match fields are projected, absent ones are null", () => {
	const legacy = postDTO(post, authorDTO(author), stats);
	expect(legacy.author.jerseyNumber).toBe(null);
	expect(legacy.author.club).toBe(null);
	expect(legacy.match).toBe(null);
	const result = postDTO(
		{
			...post,
			matchOpponent: "AS Vénissieux",
			matchScoreFor: 2,
			matchScoreAgainst: 1,
			matchMinute: 67,
		},
		authorDTO({ ...author, jerseyNumber: 8, clubId: "club-1", clubName: null }),
		stats,
	);
	expect(result.author.jerseyNumber).toBe(8);
	expect(result.author.club).toEqual({ id: "club-1", name: null });
	expect(result.match).toEqual({
		opponent: "AS Vénissieux",
		scoreFor: 2,
		scoreAgainst: 1,
		minute: 67,
	});
	const textClub = authorDTO({ ...author, clubName: "FC Lyon U17" });
	expect(textClub.club).toEqual({ id: null, name: "FC Lyon U17" });
});
test("incomplete match metadata hides the bug, out-of-range values fail closed", () => {
	expect(
		postDTO(
			{ ...post, matchOpponent: "Bron", matchScoreFor: null },
			authorDTO(author),
			stats,
		).match,
	).toBe(null);
	expect(
		postDTO(
			{
				...post,
				matchOpponent: "Bron",
				matchScoreFor: 1,
				matchScoreAgainst: 0,
			},
			authorDTO(author),
			stats,
		).match,
	).toEqual({ opponent: "Bron", scoreFor: 1, scoreAgainst: 0, minute: null });
	expect(() => authorDTO({ ...author, jerseyNumber: 100 })).toThrow();
	expect(() =>
		postDTO({ ...post, matchMinute: -1 }, authorDTO(author), stats),
	).toThrow();
});
