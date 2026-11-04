import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { clientForbiddenEnvNames } from "../server/env";

const clientRoot = resolve(import.meta.dir, "../dist/client");
const forbidden =
	/@tanstack\/react-start\/server(?:-only)?|env\.server|nfe-shell-reader|START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY|account_lifecycle_anchors|account_lifecycle_operations|START_APPWRITE_MODERATION_READER_KEY|START_APPWRITE_MODERATION_WRITER_KEY|START_APPWRITE_NOTIFICATION_WRITER_KEY|notification_outbox_v1|notification_recovery_v1|START_APPWRITE_INTERACTION_WRITER_KEY|START_APPWRITE_POST_TEXT_WRITER_KEY|B2_APPLICATION_KEY|START_MEDIA_|START_LIFECYCLE_|START_ACCOUNT_DELETION_|START_APPWRITE_LIFECYCLE_WRITER_KEY|START_APPWRITE_MEDIA_WRITER_KEY|START_APPWRITE_MEDIA_READER_KEY|@aws-sdk|START_APPWRITE_FEED_READER_KEY|START_FEED_TRACE|START_APPWRITE_PROFILE_WRITER_KEY|START_APPWRITE_DATABASE|START_APPWRITE_SESSION_KEY|START_APPWRITE_ENDPOINT|START_APPWRITE_PROJECT|START_APP_ORIGIN|__Host-nfe-session|nfe-session-dev|node-appwrite|DATABASE_URL|RESEND_API_KEY|BETTER_AUTH_SECRET|CLOUDINARY_API_SECRET|NFE_PRIVATE_BUNDLE_CANARY|from\s*["']next\//;
// Every server-only runtime variable name from the production contract, plus the
// value of an optional build-time canary: a bundler inlining `process.env` would
// expose that value, so the Docker build sets one and this scan rejects it.
const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canary = process.env.NFE_PRIVATE_BUNDLE_CANARY;
const runtimeNames = new RegExp(
	[...clientForbiddenEnvNames, ...(canary ? [canary] : [])]
		.map(escapeRegExp)
		.join("|"),
);

let checked = 0;
for await (const path of new Bun.Glob("**/*.js").scan(clientRoot)) {
	const contents = await readFile(resolve(clientRoot, path), "utf8");
	if (forbidden.test(contents) || runtimeNames.test(contents))
		throw new Error(`Server-only content detected in client artifact: ${path}`);
	checked++;
}
if (!checked)
	throw new Error("Build Start before inspecting the client artifacts");
process.stdout.write(
	`Inspected ${checked} client JS artifacts: no forbidden server content (${clientForbiddenEnvNames.length} runtime variable names${canary ? ", build canary value" : ""})\n`,
);
