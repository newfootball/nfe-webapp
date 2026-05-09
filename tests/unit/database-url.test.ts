import { afterEach, describe, expect, it } from "bun:test";
import { expandEnvReferences } from "@/src/lib/database-url";

const originalEnv = { ...process.env };

const envRef = (name: string) => `\${${name}}`;

afterEach(() => {
	process.env = { ...originalEnv };
});

describe("database URL helpers", () => {
	it("expands variables embedded in DATABASE_URL", () => {
		process.env.POSTGRES_USER = "app";
		process.env.POSTGRES_PASSWORD = "password";
		process.env.POSTGRES_HOST = "localhost";
		process.env.POSTGRES_PORT = "3501";
		process.env.POSTGRES_DB = "app";

		expect(
			expandEnvReferences(
				`postgresql://${envRef("POSTGRES_USER")}:${envRef("POSTGRES_PASSWORD")}@${envRef("POSTGRES_HOST")}:${envRef("POSTGRES_PORT")}/${envRef("POSTGRES_DB")}`,
			),
		).toBe("postgresql://app:password@localhost:3501/app");
	});

	it("throws when an embedded variable is missing", () => {
		process.env.MISSING_DATABASE_PORT = undefined;

		expect(() =>
			expandEnvReferences(
				`postgresql://localhost:${envRef("MISSING_DATABASE_PORT")}/app`,
			),
		).toThrow("MISSING_DATABASE_PORT");
	});
});
