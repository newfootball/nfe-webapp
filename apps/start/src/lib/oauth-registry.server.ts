import "@tanstack/react-start/server-only";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { registrySchema } from "./oauth-registry";
export async function privateRegistry() {
	const path = process.env.START_OAUTH_REGISTRY_PATH;
	if (!path) throw new Error("Registry unavailable");
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const stat = await file.stat();
		if (
			!stat.isFile() ||
			(stat.mode & 0o777) !== 0o600 ||
			stat.uid !== process.getuid?.() ||
			stat.size > 16 * 1024 * 1024
		)
			throw new Error("Unsafe registry");
		return registrySchema.parse(JSON.parse(await file.readFile("utf8")));
	} finally {
		await file.close();
	}
}
