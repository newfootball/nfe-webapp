import { expect, test } from "bun:test";
import { providerRegistry } from "./oauth-registry";

const user = {
	id: "synthetic-imported",
	email: "private@example.test",
	emailVerified: false,
	role: "USER" as const,
	legacyPassword: "private-hash",
	accounts: [
		{ providerId: "google", accountId: "synthetic-sub", password: null },
	],
};
test("private provider export excludes email, credential and legacy token data", () => {
	const output = JSON.stringify(providerRegistry([user], "0".repeat(64)));
	expect(output).not.toContain("private@example.test");
	expect(output).not.toContain("private-hash");
	expect(output).not.toContain("password");
	expect(JSON.parse(output).coverageComplete).toBe(false);
	expect(JSON.parse(output).identities[0].userId).toBe(user.id);
});
test("duplicate provider subject or target fails closed", () => {
	expect(() =>
		providerRegistry([user, { ...user, id: "other" }], "0".repeat(64)),
	).toThrow();
	expect(() =>
		providerRegistry(
			[
				{
					...user,
					accounts: [
						...user.accounts,
						{ providerId: "google", accountId: "other", password: null },
					],
				},
			],
			"0".repeat(64),
		),
	).toThrow();
});
test("source projection rejects email, password and historical token fields", async () => {
	const { providerSourceSchema } = await import("./oauth-registry");
	expect(
		providerSourceSchema.safeParse({ version: 1, users: [user] }).success,
	).toBe(false);
	const projection = {
		id: user.id,
		accounts: [{ providerId: "google", accountId: "synthetic-sub" }],
	};
	expect(
		providerSourceSchema.safeParse({ version: 1, users: [projection] }).success,
	).toBe(true);
	expect(
		providerSourceSchema.safeParse({
			version: 1,
			users: [
				{
					...projection,
					accounts: [{ ...projection.accounts[0], accessToken: "forbidden" }],
				},
			],
		}).success,
	).toBe(false);
});
