import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	publicDir: "../../public",
	envDir: ".",
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: {
			"@/lib/utils": fileURLToPath(
				new URL("../../src/lib/utils.ts", import.meta.url),
			),
		},
	},
	plugins: [
		tailwindcss(),
		tanstackStart({ importProtection: { behavior: "error" } }),
		react(),
	],
});
