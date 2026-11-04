import { expect, test } from "bun:test";
import { targetBinding } from "./target";

test("disposable import stacks and the persistent local runtime are the only targets", () => {
	expect(
		targetBinding("http://127.0.0.1:18663/v1", "nfe-import-63-proof", "db"),
	).toContain("nfe-import-63-proof");
	expect(
		targetBinding("http://127.0.0.1:18464/v1", "nfe-local", "nfe-rehearsal"),
	).toContain("nfe-local");
	for (const [endpoint, project, database] of [
		["http://127.0.0.1:18663/v1", "nfe-local", "db"],
		["http://127.0.0.1:18464/v1", "nfe-local-2", "db"],
		["http://127.0.0.1:18464/v1", "nfe-local", ""],
		["http://localhost:18464/v1", "nfe-local", "db"],
		["https://127.0.0.1:18464/v1", "nfe-local", "db"],
		["http://127.0.0.1:18464/v1?x=1", "nfe-local", "db"],
		["http://127.0.0.1:18464/v2", "nfe-local", "db"],
		["http://127.0.0.1/v1", "nfe-import-63-proof", "db"],
	] as const)
		expect(() => targetBinding(endpoint, project, database)).toThrow(
			"isolated_loopback_target_required",
		);
});
