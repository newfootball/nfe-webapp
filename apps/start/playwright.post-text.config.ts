import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "post-text.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 120000,
	use: {
		baseURL: "http://127.0.0.1:3570",
		headless: true,
		actionTimeout: 10000,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
});
