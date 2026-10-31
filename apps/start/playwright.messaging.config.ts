import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "messaging.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 120000,
	use: {
		baseURL: "http://127.0.0.1:3590",
		headless: true,
		actionTimeout: 10000,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
});
