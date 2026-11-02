import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	outputDir: process.env.NFE_BUSINESS_QA_OUTPUT,
	reporter: "line",
	testMatch: "business-import.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 120000,
	use: {
		baseURL: "http://127.0.0.1:3563",
		channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
		headless: true,
		trace: "off",
		screenshot: "off",
		video: "off",
	},
});
