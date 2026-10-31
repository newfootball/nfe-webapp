import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "moderation.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 300_000,
	use: {
		baseURL: "http://127.0.0.1:3574",
		headless: true,
		serviceWorkers: "block",
		actionTimeout: 10000,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
});
