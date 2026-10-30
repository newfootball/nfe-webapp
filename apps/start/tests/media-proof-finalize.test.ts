import { expect, test } from "bun:test";
import { finalizeMediaProof } from "../scripts/media-proof-finalize";

test("consecutive cleanup and ACL errors still destroy and persist a fresh failure", async () => {
	const report: Record<string, unknown> = { status: "passed", run: "current" };
	let persisted = JSON.stringify({ status: "passed", run: "stale" });
	let destroyed = false;
	const exit = await finalizeMediaProof(report, 0, {
		stop: async () => {},
		cleanup: async () => {
			throw new Error("provider secret");
		},
		verifyPrivacy: async () => {
			throw new Error("signed URL");
		},
		destroy: () => {
			destroyed = true;
		},
		persist: async () => {
			persisted = JSON.stringify(report);
		},
	});
	expect(exit).toBe(1);
	expect(destroyed).toBe(true);
	expect(JSON.parse(persisted)).toEqual({
		status: "failed",
		run: "current",
		cleanup: {
			failed: true,
			failedSteps: ["owned-cleanup", "privacy-verification"],
			bucketRetainedPrivate: "unverified",
			protectedJournal: "scripts/.media-local/cleanup-*.json",
			action: "retry owned cleanup before deleting local backend",
		},
	});
	expect(persisted).not.toContain("provider secret");
	expect(persisted).not.toContain("signed URL");
});

test("server and client failures cannot prevent owned cleanup or report emission", async () => {
	const report: Record<string, unknown> = { status: "passed" };
	const calls: string[] = [];
	expect(
		await finalizeMediaProof(report, 0, {
			stop: async () => {
				throw new Error();
			},
			cleanup: async () => {
				calls.push("cleanup");
				return { remainingVersions: 0 };
			},
			verifyPrivacy: async () => {
				calls.push("privacy");
			},
			destroy: () => {
				throw new Error();
			},
			persist: async () => {
				calls.push("persist");
			},
		}),
	).toBe(1);
	expect(calls).toEqual(["cleanup", "privacy", "persist"]);
	expect(report.status).toBe("failed");
});
