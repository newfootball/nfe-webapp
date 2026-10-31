import { describe, expect, test } from "bun:test";
import { spamScore } from "../src/lib/moderation-contract";
import {
	AdminPageSchema,
	DecisionSchema,
	ReportSchema,
	SIGNAL_REASONS,
} from "../src/lib/moderation-input";
import { moderationMessages } from "../src/lib/moderation-messages";
import {
	moderationTransaction,
	sameRevision,
} from "../src/lib/moderation-transaction";

const version = "2026-10-30T12:00:00.000Z";
describe("moderation boundaries", () => {
	test("preserves Appwrite offset revision tokens for all three admin operations", () => {
		const token = "2026-10-29T16:09:07.762+00:00";
		for (const operation of ["review", "dismiss", "reject"] as const) {
			const input = {
				signalId: "s",
				postId: "p",
				operation,
				signalVersion: token,
				postVersion: token,
			};
			expect(DecisionSchema.parse(input)).toEqual(input);
			expect(
				DecisionSchema.safeParse({ ...input, role: "admin" }).success,
			).toBe(false);
		}
		expect(
			DecisionSchema.safeParse({
				signalId: "s",
				postId: "p",
				operation: "reject",
				signalVersion: "not-a-revision",
				postVersion: token,
			}).success,
		).toBe(false);
		const parent = {
			$id: "p",
			$updatedAt: token,
			userId: "a",
			status: "PUBLISHED",
		};
		expect(
			sameRevision(parent, {
				...parent,
				$updatedAt: "2026-10-29T16:09:08.762+00:00",
			}),
		).toBe(false);
	});
	test("accepts every legacy reason and imported ID without renaming", () => {
		for (const reason of SIGNAL_REASONS)
			expect(
				ReportSchema.parse({
					postId: "legacy.id-1",
					reason,
					details: " detail ",
				}),
			).toEqual({ postId: "legacy.id-1", reason, details: "detail" });
	});
	test("rejects forged authorization, statuses, references and arbitrary operations", () => {
		expect(
			ReportSchema.safeParse({ postId: "p", reason: "SPAM", role: "admin" })
				.success,
		).toBe(false);
		expect(
			ReportSchema.safeParse({ postId: "../p", reason: "SPAM" }).success,
		).toBe(false);
		expect(
			ReportSchema.safeParse({
				postId: "p",
				reason: "OTHER",
				details: "x".repeat(65536),
			}).success,
		).toBe(false);
		expect(
			DecisionSchema.safeParse({
				signalId: "s",
				postId: "p",
				operation: "delete",
				signalVersion: version,
				postVersion: version,
			}).success,
		).toBe(false);
		expect(
			DecisionSchema.safeParse({
				signalId: "s",
				postId: "p",
				operation: "reject",
			}).success,
		).toBe(false);
		expect(
			AdminPageSchema.safeParse({ kind: "users", limit: 99999 }).success,
		).toBe(false);
	});
	test("keeps the five and ten report thresholds", () => {
		expect([0, 4, 5, 9, 10, 100].map(spamScore)).toEqual([
			"NONE",
			"NONE",
			"SUSPECT",
			"SUSPECT",
			"SPAM",
			"SPAM",
		]);
	});
	test("FR and EN have matching operations and reasons", () => {
		expect(Object.keys(moderationMessages.fr)).toEqual(
			Object.keys(moderationMessages.en),
		);
		expect(Object.keys(moderationMessages.fr.reasons)).toEqual([
			...SIGNAL_REASONS,
		]);
		expect(Object.keys(moderationMessages.en.reasons)).toEqual([
			...SIGNAL_REASONS,
		]);
	});
	test("revision checks reject concurrent status, owner or version changes", () => {
		const p = {
			$id: "p",
			$updatedAt: version,
			userId: "a",
			status: "PUBLISHED",
		};
		expect(sameRevision(p, { ...p })).toBe(true);
		for (const changed of [
			{ status: "ARCHIVED" },
			{ userId: "b" },
			{ $updatedAt: "2026-10-30T12:01:00.000Z" },
		])
			expect(sameRevision(p, { ...p, ...changed })).toBe(false);
	});
});
describe("atomic moderation remote boundary", () => {
	test("publishes neither staged operation when a child write fails", async () => {
		const state = { status: "PUBLISHED", signal: "PENDING" },
			staged = { ...state },
			calls: string[] = [];
		await expect(
			moderationTransaction(
				{
					begin: async () => "tx",
					commit: async () => {
						Object.assign(state, staged);
						calls.push("commit");
					},
					rollback: async () => {
						calls.push("rollback");
					},
				},
				async () => {
					staged.status = "REJECTED";
					throw new Error("signal failure");
				},
			),
		).rejects.toThrow("signal failure");
		expect(state).toEqual({ status: "PUBLISHED", signal: "PENDING" });
		expect(calls).toEqual(["rollback"]);
	});
	test("commit conflict rolls back and does not return success", async () => {
		const calls: string[] = [];
		await expect(
			moderationTransaction(
				{
					begin: async () => "tx",
					commit: async () => {
						calls.push("commit");
						throw new Error("409");
					},
					rollback: async () => {
						calls.push("rollback");
					},
				},
				async () => "success",
			),
		).rejects.toThrow("409");
		expect(calls).toEqual(["commit", "rollback"]);
	});
	test("commits the complete operation once and preserves original errors on rollback failure", async () => {
		const calls: string[] = [];
		const tx = {
			begin: async () => "tx",
			commit: async () => {
				calls.push("commit");
			},
			rollback: async () => {
				throw new Error("rollback");
			},
		};
		expect(
			await moderationTransaction(tx, async (id) => {
				expect(id).toBe("tx");
				return 42;
			}),
		).toBe(42);
		expect(calls).toEqual(["commit"]);
		await expect(
			moderationTransaction(tx, async () => {
				throw new Error("write");
			}),
		).rejects.toThrow("write");
	});
});
