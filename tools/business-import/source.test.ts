import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectSource, readSource } from "./source";

const date = "2026-01-01T00:00:00.000Z";
const times = { createdAt: date, updatedAt: date };
function fixture() {
	return {
		version: 1,
		tables: {
			User: [
				{
					id: "user",
					name: "private-name",
					email: "private@example.test",
					emailVerified: true,
					image: null,
					birthday: null,
					fullName: null,
					biography: null,
					position: ["STRIKER"],
					foot: ["LEFT"],
					license: null,
					contract: null,
					size: null,
					weight: null,
					localisation: null,
					gender: null,
					role: "USER",
					userType: "PLAYER",
					isOnboarded: true,
					...times,
				},
			],
			Account: [
				{
					id: "account",
					userId: "user",
					providerId: "credential",
					accountId: "private-account",
					...times,
				},
			],
			Post: [
				{
					id: "post",
					slug: "slug",
					userId: "user",
					title: "title",
					type: "shortVideo",
					status: "PUBLISHED",
					description: "content",
					spamScore: "NONE",
					...times,
					expiresAt: null,
					validatedAt: null,
					publishedAt: date,
				},
			],
			Media: [
				{
					id: "media",
					type: "shortVideo",
					postId: "post",
					mimetype: "video/mp4",
					url: "https://example.test/video",
					filename: null,
					label: null,
					metadata: { width: 42 },
					...times,
				},
			],
			Follow: [],
			Like: [{ id: "like", userId: "user", postId: "post", ...times }],
			Favorite: [],
			Comment: [],
			Message: [],
			Notification: [
				{
					id: "notice",
					userId: "user",
					type: "LIKE",
					content: "private",
					link: null,
					readAt: date,
					...times,
				},
			],
			PostSignal: [],
		},
	};
}
describe("private business snapshot", () => {
	test("preserves business data and reports only counts", () => {
		const input = fixture();
		const result = projectSource(input);
		expect(result.source as unknown).toEqual(
			Object.fromEntries(
				Object.entries(input.tables).filter(([name]) => name !== "Account"),
			),
		);
		expect(result.report.Media).toBe(1);
		expect(JSON.stringify(result.report)).not.toContain("private");
		expect(JSON.stringify(result.source)).not.toContain("private-account");
	});
	test("retains PostgreSQL local timestamps and nullable legacy arrays", () => {
		const input = fixture();
		const user = input.tables.User[0];
		if (!user) throw new Error("missing_fixture");
		Object.assign(user, {
			position: null,
			foot: null,
			createdAt: "2026-01-01T01:02:03.12",
		});
		const projected = projectSource(input).source.User[0];
		expect(projected?.position).toBeNull();
		expect(projected?.foot).toBeNull();
		expect(projected?.createdAt).toBe("2026-01-01T01:02:03.12");
	});
	test("rejects unknown fields and invalid enums without disclosing values", () => {
		for (const mutate of [
			(f: ReturnType<typeof fixture>) =>
				Object.assign(f.tables.User[0]!, { password: "secret" }),
			(f: ReturnType<typeof fixture>) =>
				Object.assign(f.tables.Account[0]!, { accessToken: "secret" }),
			(f: ReturnType<typeof fixture>) =>
				Object.assign(f.tables.Media[0]!, { type: "secret" }),
			(f: ReturnType<typeof fixture>) =>
				Object.assign(f.tables.Post[0]!, { createdAt: "secret" }),
		]) {
			const f = fixture();
			mutate(f);
			expect(() => projectSource(f)).toThrow("invalid_source_projection");
		}
	});
	test("rejects duplicate IDs, composite keys and dangling references", () => {
		for (const mutate of [
			(f: ReturnType<typeof fixture>) =>
				f.tables.Media.push({ ...f.tables.Media[0]! }),
			(f: ReturnType<typeof fixture>) =>
				f.tables.Like.push({ ...f.tables.Like[0]!, id: "other" }),
			(f: ReturnType<typeof fixture>) => {
				f.tables.Media[0]!.postId = "missing";
			},
			(f: ReturnType<typeof fixture>) => {
				f.tables.Account[0]!.userId = "missing";
			},
			(f: ReturnType<typeof fixture>) => {
				f.tables.Notification[0]!.userId = "missing";
			},
		]) {
			const f = fixture();
			mutate(f);
			expect(() => projectSource(f)).toThrow("invalid_source_projection");
		}
	});
	test("requires authorization and a private regular file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "business-source-"));
		const path = join(dir, "source.json");
		try {
			await writeFile(path, JSON.stringify(fixture()), { mode: 0o600 });
			await expect(readSource(path, false)).rejects.toThrow(
				"source_authorization_required",
			);
			expect((await readSource(path, true)).report.User).toBe(1);
			await chmod(path, 0o644);
			await expect(readSource(path, true)).rejects.toThrow(
				"unsafe_private_file",
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
