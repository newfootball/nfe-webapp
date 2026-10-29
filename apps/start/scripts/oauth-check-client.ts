import { readFile } from "node:fs/promises";

const root = `${import.meta.dir}/../dist/client`;
let checked = 0;
for await (const file of new Bun.Glob("**/*.js").scan(root)) {
	const text = await readFile(`${root}/${file}`, "utf8");
	if (
		/START_GOOGLE_|START_OAUTH_|START_RECOVERY_|openid-client|node-appwrite|nfe-oidc|nfe-challenge|synthetic-unused/.test(
			text,
		)
	)
		throw new Error("OAuth/recovery server content in client bundle");
	checked++;
}
if (!checked) throw new Error("Build required");
process.stdout.write(
	`OAuth/recovery scan: ${checked} client artifacts clean\n`,
);
