import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: ["media.pw.ts", "media-ui.pw.ts"],
	projects: [
		{ name: "core", testMatch: "media.pw.ts" },
		{ name: "mounted-ui", testMatch: "media-ui.pw.ts", dependencies: ["core"] },
	],
	workers: 1,
	retries: 0,
	timeout: 240000,
	use: {
		baseURL: "http://127.0.0.1:3555",
		channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
		headless: true,
		actionTimeout: 15000,
		trace: "off",
		screenshot: "off",
		video: "off",
	},
});
