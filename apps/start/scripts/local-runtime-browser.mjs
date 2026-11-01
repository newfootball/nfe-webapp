import assert from "node:assert/strict";
import { lstat, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

assert.equal(process.versions.node.split(".")[0], "24", "Use Node24");
const [fixturePath, sessionPath] = process.argv.slice(2);
assert.ok(fixturePath && sessionPath);
assert.equal(dirname(resolve(fixturePath)), dirname(resolve(sessionPath)));
const info = await lstat(fixturePath);
assert.ok(
	info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o600,
);
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
	timeout: 15_000,
});
let context;
try {
	context = await browser.newContext();
	const page = await context.newPage();
	page.setDefaultTimeout(10_000);
	page.setDefaultNavigationTimeout(10_000);
	await page.goto("http://127.0.0.1:3564/fr/private");
	assert.ok(page.url().includes("/fr/sign-in"));
	await page.getByLabel("Adresse e-mail").fill(fixture.email);
	await page.getByLabel("Mot de passe").fill(fixture.password);
	await page.getByRole("button", { name: "Connexion", exact: true }).click();
	await page.getByTestId("identity").waitFor();
	assert.equal(await page.getByTestId("identity").innerText(), fixture.id);
	const cookie = (await context.cookies()).find(
		(c) => c.name === "nfe-session-dev",
	);
	assert.ok(cookie?.httpOnly && cookie.sameSite === "Lax");
} finally {
	try {
		const cookie = (await context?.cookies())?.find(
			(c) => c.name === "nfe-session-dev",
		);
		if (cookie) {
			const file = await open(sessionPath, "wx", 0o600);
			try {
				await file.writeFile(
					JSON.stringify({
						cookie: cookie.value,
						secret: decodeURIComponent(cookie.value),
					}),
				);
				await file.sync();
			} finally {
				await file.close();
			}
		}
	} finally {
		await browser.close();
	}
}
