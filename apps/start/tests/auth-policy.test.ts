import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { clearIdentityCache } from "../src/lib/auth-cache";
import {
	isTrustedMutation,
	safeReturnPath,
	sessionCookiePolicy,
} from "../src/lib/auth-policy";

describe("auth boundary policy", () => {
	test("strict mutation origin also rejects sibling sites, missing origin and GET", () => {
		for (const origin of [
			"https://evil.test",
			"null",
			"https://app.test.evil",
			"",
		])
			expect(
				isTrustedMutation(
					new Request("https://app.test", {
						method: "POST",
						headers: { origin },
					}),
					"https://app.test",
				),
			).toBe(false);
		expect(
			isTrustedMutation(
				new Request("https://app.test", {
					method: "POST",
					headers: { origin: "https://app.test" },
				}),
				"https://app.test",
			),
		).toBe(true);
		expect(
			isTrustedMutation(
				new Request("https://app.test", {
					method: "POST",
					headers: {
						origin: "https://app.test",
						"sec-fetch-site": "same-site",
					},
				}),
				"https://app.test",
			),
		).toBe(false);
		expect(
			isTrustedMutation(
				new Request("https://app.test", {
					headers: { origin: "https://app.test" },
				}),
				"https://app.test",
			),
		).toBe(false);
	});
	test("secure host-only cookie; HTTP is an explicit loopback-only exception", () => {
		expect(sessionCookiePolicy("https://app.test", false)).toEqual({
			name: "__Host-nfe-session",
			options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
		});
		expect(
			sessionCookiePolicy("http://127.0.0.1:3511", true).options.secure,
		).toBe(false);
		for (const origin of [
			"http://app.test",
			"http://127.0.0.1.evil.test",
			"https://app.test/path",
		])
			expect(() => sessionCookiePolicy(origin, true)).toThrow();
		expect(() => sessionCookiePolicy("http://localhost", false)).toThrow();
	});
	test("return paths remain on the private locale route", () => {
		for (const path of [
			"https://evil.test",
			"//evil.test",
			"/\\evil.test",
			"/en/private",
			"/fr/private?next=//evil.test",
			"/fr/%2f%2fevil.test",
			null,
		])
			expect(safeReturnPath(path, "fr")).toBe("/fr/private");
	});
	test("identity change removes both private cache and pending prior-account writes", async () => {
		const query = new QueryClient();
		query.setQueryData(["private"], { id: "A" });
		let resolve: (value: string) => void = () => {};
		const pending = query
			.fetchQuery({
				queryKey: ["pending"],
				queryFn: () =>
					new Promise<string>((r) => {
						resolve = r;
					}),
			})
			.catch(() => {});
		await clearIdentityCache(query);
		resolve("A");
		await pending;
		expect(query.getQueryCache().getAll()).toEqual([]);
	});
});
