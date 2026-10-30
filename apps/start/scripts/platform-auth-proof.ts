import { bootstrap } from "./auth-bootstrap";
import { endpoint } from "./auth-local";

// Requires the existing dedicated synthetic auth stack and its coordinator slot.
const credentials = await bootstrap();
const proof = Bun.spawn(
	[
		"bun",
		"x",
		"--no-install",
		"playwright",
		"test",
		"--config",
		"playwright.platform-auth.config.ts",
	],
	{
		cwd: `${import.meta.dir}/..`,
		env: {
			...process.env,
			START_APP_ORIGIN: "http://127.0.0.1:3572",
			START_APPWRITE_ENDPOINT: endpoint,
			START_APPWRITE_PROJECT: credentials.project,
			START_APPWRITE_SESSION_KEY: credentials.sessionKey,
			START_AUTH_ALLOW_HTTP_LOOPBACK: "true",
		},
		stdout: "pipe",
		stderr: "pipe",
	},
);
const [stdout, stderr, code] = await Promise.all([
	new Response(proof.stdout).text(),
	new Response(proof.stderr).text(),
	proof.exited,
]);
let output = stdout + stderr;
for (const secret of [credentials.proofKey, credentials.sessionKey])
	output = output.replaceAll(secret, "[REDACTED]");
process.stdout.write(output);
process.exit(code);
