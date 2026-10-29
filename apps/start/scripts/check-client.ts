import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const clientRoot = resolve(import.meta.dir, "../dist/client");
const forbidden =
	/@tanstack\/react-start\/server(?:-only)?|env\.server|nfe-shell-reader|START_APPWRITE_FEED_READER_KEY|START_FEED_TRACE|START_APPWRITE_PROFILE_WRITER_KEY|START_APPWRITE_DATABASE|START_APPWRITE_SESSION_KEY|START_APPWRITE_ENDPOINT|START_APPWRITE_PROJECT|START_APP_ORIGIN|__Host-nfe-session|nfe-session-dev|node-appwrite|DATABASE_URL|RESEND_API_KEY|BETTER_AUTH_SECRET|CLOUDINARY_API_SECRET|NFE_PRIVATE_BUNDLE_CANARY|from\s*["']next\//;
let checked = 0;
for await (const path of new Bun.Glob("**/*.js").scan(clientRoot)) {
	const contents = await readFile(resolve(clientRoot, path), "utf8");
	if (forbidden.test(contents))
		throw new Error(`Server-only content detected in client artifact: ${path}`);
	checked++;
}
if (!checked)
	throw new Error("Build Start before inspecting the client artifacts");
process.stdout.write(
	`Inspected ${checked} client JS artifacts: no forbidden server content\n`,
);
