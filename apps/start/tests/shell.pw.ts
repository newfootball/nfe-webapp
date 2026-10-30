import { expect, test } from "@playwright/test";

// Keep network fault injection observable; platform suites exercise the real worker.
test.use({ serviceWorkers: "block" });

test("SSR renders both languages and isolates concurrent readers", async ({
	request,
}) => {
	const responses = await Promise.all(
		Array.from({ length: 8 }, (_, index) => {
			const reader = `reader-${index}`;
			return request
				.get(index % 2 ? "/en" : "/fr", {
					headers: { Cookie: `nfe-shell-reader=${reader}` },
				})
				.then(async (response) => ({
					response,
					reader,
					html: await response.text(),
					index,
				}));
		}),
	);
	for (const { response, reader, html, index } of responses) {
		expect(response.status()).toBe(200);
		expect(response.headers()["cache-control"]).toContain("no-store");
		expect(html).toContain(
			index % 2 ? "Football starts here" : "Le football commence ici",
		);
		expect(html).toContain(`>${reader}</p>`);
		for (let other = 0; other < 8; other++)
			if (other !== index) expect(html).not.toContain(`reader-${other}`);
	}
	const missing = await request.get("/fr/missing");
	expect(missing.status()).toBe(404);
	expect(await missing.text()).toContain("Page introuvable");
	const invalid = await request.get("/es");
	expect(invalid.status()).toBe(404);
});

test("hydrates, navigates without document reload, and persists theme", async ({
	page,
	context,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await context.addCookies([
		{
			name: "nfe-shell-reader",
			value: "browser-reader",
			url: "http://127.0.0.1:3501",
		},
	]);
	await page.goto("/fr");
	await expect(page.getByTestId("reader")).toHaveText("browser-reader");
	// A value on window disappears on full-document navigation.
	await page.evaluate(() => {
		Object.assign(window, { navigationWitness: "alive" });
	});
	await page.getByRole("link", { name: "À propos", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Notre terrain de jeu" }),
	).toBeVisible();
	expect(
		await page.evaluate(() => Reflect.get(window, "navigationWitness")),
	).toBe("alive");
	await page.getByRole("link", { name: "English", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Football starts here" }),
	).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await page.getByRole("button", { name: "Change theme" }).click();
	const theme = await page.locator("html").getAttribute("class");
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("class", theme ?? "");
	expect(errors).toEqual([]);
});

test("renders a recoverable error boundary when a server read fails", async ({
	page,
}) => {
	await page.goto("/fr/about");
	await page.route("**/_serverFn/**", (route) => route.abort());
	await page.getByRole("link", { name: "Accueil", exact: true }).click();
	await expect(
		page.getByRole("heading", {
			name: "Une erreur est survenue / Something went wrong",
		}),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Réessayer / Try again" }),
	).toBeVisible();
	await page.unroute("**/_serverFn/**");
	await page.getByRole("button", { name: "Réessayer / Try again" }).click();
	await expect(
		page.getByRole("heading", { name: "Le football commence ici" }),
	).toBeVisible();
});
