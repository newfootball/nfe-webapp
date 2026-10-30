import { expect, test } from "@playwright/test";

test("historical pages expose localized content and metadata without JavaScript", async ({
	browser,
	baseURL,
}) => {
	for (const locale of ["fr", "en"]) {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			locale: locale === "fr" ? "fr-FR" : "en-GB",
			extraHTTPHeaders: { "Accept-Language": locale },
		});
		const page = await context.newPage();
		for (const path of ["about-us", "contact", "privacy", "terms", "splash"]) {
			const response = await page.goto(`${baseURL}/${path}`);
			expect(response?.status()).toBe(200);
			await expect(page.locator("html")).toHaveAttribute("lang", locale);
			await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
				"href",
				`${baseURL}/${path}`,
			);
			await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
				"content",
				/.+/,
			);
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
				"content",
				"noindex, nofollow",
			);
		}
		await page.locator('a[href="/splash/continue"]').click();
		expect(
			(await context.cookies()).find((cookie) => cookie.name === "seen_splash")
				?.value,
		).toBe("true");
		await expect(page).toHaveURL(new RegExp(`/${locale}$`));
		await context.close();
	}
});

test("splash hydrates and continues automatically; robots deny indexing", async ({
	page,
	request,
	baseURL,
}) => {
	await page.context().addCookies([
		{
			name: "NEXT_LOCALE",
			value: "fr",
			url: baseURL ?? "http://127.0.0.1:3501",
		},
	]);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.clock.install();
	await page.goto("/splash");
	await page.clock.fastForward(10001);
	await expect(page).toHaveURL(/\/fr$/);
	expect(
		(await page.context().cookies()).some(
			(cookie) => cookie.name === "seen_splash",
		),
	).toBe(true);
	expect(errors).toEqual([]);
	const robots = await request.get("/robots.txt");
	expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
});
