import { existsSync } from "node:fs";

// Hooks are a developer checkout concern, not a build/install prerequisite.
if (!process.env.CI && !process.env.VERCEL && existsSync(".git")) {
	const result = Bun.spawnSync(["lefthook", "install"], {
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(result.exitCode);
}
