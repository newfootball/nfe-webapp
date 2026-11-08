import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "production-*.pw.ts",
	workers: 1,
	retries: 0,
	use: {
		baseURL: process.env.SMOKE_ORIGIN ?? "https://nfe-foot.com",
		headless: true,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
});
