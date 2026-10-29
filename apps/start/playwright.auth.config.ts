import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "auth.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 180_000,
	use: {
		baseURL: "http://127.0.0.1:3511",
		headless: true,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
});
