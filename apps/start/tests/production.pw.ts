import { expect, test } from "@playwright/test";

// Login and an authenticated Appwrite read on a deployed release (Refs #64).
// Needs a dedicated smoke account: SMOKE_EMAIL / SMOKE_PASSWORD. Never a real user.
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

test("login, private read, uncaught errors and logout behind the real proxy", async ({
	page,
	context,
	baseURL,
}) => {
	test.skip(!email || !password, "SMOKE_EMAIL/SMOKE_PASSWORD not set: not_run");
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.name));
	const serverErrors: string[] = [];
	page.on("response", (response) => {
		if (response.url().startsWith(baseURL ?? "") && response.status() >= 500)
			serverErrors.push(
				`${response.status()} ${new URL(response.url()).pathname}`,
			);
	});

	await page.goto("/fr/sign-in");
	await page.getByLabel("Adresse e-mail").fill(email as string);
	await page.getByLabel("Mot de passe").fill(password as string);
	await page.getByRole("button", { name: "Connexion", exact: true }).click();
	await expect(page).not.toHaveURL(/sign-in/);

	const session = (await context.cookies()).find(
		(c) => c.name === "__Host-nfe-session",
	);
	expect(session?.secure).toBe(true);
	expect(session?.httpOnly).toBe(true);

	await page.goto("/fr/private");
	await expect(page.getByTestId("identity")).toBeVisible();
	await page.goto("/fr/notifications");
	await expect(page).toHaveURL(/\/fr\/notifications/);

	await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
	await expect(page).toHaveURL(/sign-in/);
	expect(serverErrors).toEqual([]);
	expect(pageErrors).toEqual([]);
});
