import { defineConfig, devices } from "@playwright/test";

// Integrated local rehearsal (#65): the persistent runtime on 127.0.0.1:3564 is
// started by tools/business-import/rehearsal.ts, never by Playwright itself.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
export default defineConfig({
	testDir: "./tests",
	outputDir: process.env.NFE_REHEARSAL_OUTPUT,
	reporter: "line",
	testMatch: "rehearsal.pw.ts",
	workers: 1,
	retries: 0,
	timeout: 120000,
	use: {
		baseURL: "http://127.0.0.1:3564",
		headless: true,
		trace: "off",
		screenshot: "off",
		video: "off",
	},
	projects: [
		{
			name: "desktop-chrome",
			use: { channel, viewport: { width: 1280, height: 800 } },
		},
		{
			name: "mobile-pixel-7",
			use: { ...devices["Pixel 7"], channel },
		},
	],
});
