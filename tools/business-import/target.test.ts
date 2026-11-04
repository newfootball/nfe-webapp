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
		["https://appwrite.example.com/v1", "nfe-production", "db"],
	] as const)
		expect(() => targetBinding(endpoint, project, database)).toThrow(
			"isolated_loopback_target_required",
		);
});
test("production binding needs explicit opt-in, https named host and database", () => {
	const production = { production: true };
	expect(
		targetBinding(
			"https://appwrite.example.com/v1",
			"nfe-production",
			"nfe",
			production,
		),
	).toBe(
		JSON.stringify([
			"https://appwrite.example.com/v1",
			"nfe-production",
			"nfe",
			"production",
		]),
	);
	expect(
		targetBinding(
			"https://appwrite.example.com:443/v1",
			"nfe-production",
			"nfe",
			production,
		),
	).toBe(
		targetBinding(
			"https://appwrite.example.com/v1",
			"nfe-production",
			"nfe",
			production,
		),
	);
	for (const [endpoint, project, database] of [
		["https://appwrite.example.com/v1", "nfe-production", ""],
		["http://appwrite.example.com/v1", "nfe-production", "nfe"],
		["https://appwrite.example.com/", "nfe-production", "nfe"],
		["https://appwrite.example.com/v1/", "nfe-production", "nfe"],
		["https://appwrite.example.com/v1?key=x", "nfe-production", "nfe"],
		["https://a:b@appwrite.example.com/v1", "nfe-production", "nfe"],
		["https://127.0.0.1/v1", "nfe-production", "nfe"],
		["https://localhost/v1", "nfe-production", "nfe"],
		["https://appwrite.local/v1", "nfe-production", "nfe"],
		["http://127.0.0.1:18464/v1", "nfe-local", "nfe"],
	] as const)
		expect(() =>
			targetBinding(endpoint, project, database, production),
		).toThrow("explicit_production_target_required");
});
