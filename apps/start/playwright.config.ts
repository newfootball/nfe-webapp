import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "shell.pw.ts",
	use: {
		baseURL: "http://127.0.0.1:3501",
		headless: true,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
	webServer: {
		command: "bun run start",
		url: "http://127.0.0.1:3501/fr",
		reuseExistingServer: false,
		env: { NODE_ENV: "production" },
	},
});
