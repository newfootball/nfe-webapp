import type { KnipConfig } from "knip";

const config: KnipConfig = {
	entry: [
		"app/**/page.tsx",
		"app/**/layout.tsx",
		"app/**/route.ts",
		"app/globals.css",
		"prisma/seeds/**/*.ts",
	],
	project: [
		"app/**/*.{ts,tsx}",
		"src/**/*.{ts,tsx}",
		"components/**/*.{ts,tsx}",
		"prisma/**/*.ts",
	],
	ignore: ["components/ui/**", "**/*.d.ts", "**/generated/**"],
	ignoreDependencies: [
		"baseline-browser-mapping",
		"@ducanh2912/next-pwa",
		"lint-staged",
	],
};

export default config;
