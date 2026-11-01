import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "post-lifecycle.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 240000,
	use: {
		baseURL: "http://127.0.0.1:3556",
		channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
		headless: true,
		trace: "off",
		screenshot: "off",
		video: "off",
	},
});
