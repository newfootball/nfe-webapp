import { defineConfig } from "@playwright/test";

const port = process.env.START_SMOKE_PORT ?? "3501";
export default defineConfig({
	testDir: "./tests",
	testMatch: ["shell.pw.ts", "public-pages.pw.ts"],
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		headless: true,
		channel: process.env.PLAYWRIGHT_CHANNEL,
	},
	webServer: {
		command: "bun run start",
		url: `http://127.0.0.1:${port}/fr`,
		reuseExistingServer: false,
		env: { NODE_ENV: "production", PORT: port },
	},
});
