import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests",
	testMatch: "platform-auth.pw.ts",
	workers: 1,
	use: {
		baseURL: "http://127.0.0.1:3572",
		headless: true,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
	webServer: {
		command: "bun run start",
		url: "http://127.0.0.1:3572/fr",
		reuseExistingServer: false,
		env: { NODE_ENV: "production", PORT: "3572" },
	},
});
