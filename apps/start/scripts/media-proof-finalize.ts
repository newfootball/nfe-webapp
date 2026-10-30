type Report = Record<string, unknown>;

// Provider errors must never suppress the current run's sanitized failure report.
export async function finalizeMediaProof(
	report: Report,
	exit: number,
	steps: {
		stop: () => Promise<void>;
		cleanup: () => Promise<Report>;
		verifyPrivacy: () => Promise<void>;
		destroy: () => void;
		persist: () => Promise<void>;
	},
) {
	const failedSteps: string[] = [];
	let cleanup: Report = {};
	try {
		try {
			await steps.stop();
		} catch {
			failedSteps.push("stop-server");
		}
		try {
			cleanup = await steps.cleanup();
		} catch {
			failedSteps.push("owned-cleanup");
		}
		try {
			await steps.verifyPrivacy();
			cleanup.bucketRetainedPrivate = true;
		} catch {
			failedSteps.push("privacy-verification");
			cleanup.bucketRetainedPrivate = "unverified";
		}
	} finally {
		try {
			steps.destroy();
		} catch {
			failedSteps.push("destroy-client");
		} finally {
			if (failedSteps.length) {
				report.status = "failed";
				exit = 1;
				Object.assign(cleanup, {
					failed: true,
					failedSteps,
					protectedJournal: "scripts/.media-local/cleanup-*.json",
					action: "retry owned cleanup before deleting local backend",
				});
			}
			report.cleanup = cleanup;
			await steps.persist();
		}
	}
	return exit;
}
