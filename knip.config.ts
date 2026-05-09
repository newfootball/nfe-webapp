import type { KnipConfig } from "knip";

const config: KnipConfig = {
	entry: [
		"app/**/page.tsx",
		"app/**/layout.tsx",
		"app/**/route.ts",
		"app/globals.css",
		"prisma/seeds/**/*.ts",
		"tests/**/*.test.ts",
	],
	project: [
		"app/**/*.{ts,tsx}",
		"src/**/*.{ts,tsx}",
		"components/**/*.{ts,tsx}",
		"prisma/**/*.ts",
		"tests/**/*.ts",
	],
	ignore: ["components/ui/**", "src/generated/**"],
	ignoreDependencies: ["baseline-browser-mapping", "lint-staged"],
};

export default config;
