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
		await page.goto(`${baseURL}/about-us`);
		const signupResponse = page.waitForResponse(
			(response) =>
				response.url() === `${baseURL}/sign-up` &&
				response.request().isNavigationRequest(),
		);
		await page.locator('a[href="/sign-up"]').click();
		expect((await signupResponse).status()).toBe(200);
		await expect(page).toHaveURL(`${baseURL}/sign-up`);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(
			locale === "fr" ? "Inscription" : "Sign up",
		);
		await expect(page.locator('input[name="name"]')).toBeVisible();
		await expect(page.locator('input[name="password"]')).toHaveAttribute(
			"autocomplete",
			"new-password",
		);
		const credentialForm = page.locator('form:has(input[name="password"])');
		await expect(credentialForm).toHaveAttribute("method", "post");
		await page.locator('input[name="name"]').fill("Synthetic NoJS");
		await page.locator('input[name="email"]').fill("nojs@example.test");
		await page
			.locator('input[name="password"]')
			.fill("Synthetic-NoJS-password");
		const submitted = page.waitForRequest(
			(request) =>
				request.isNavigationRequest() && request.frame() === page.mainFrame(),
		);
		await credentialForm
			.getByRole("button", {
				name: locale === "fr" ? "Inscription" : "Sign up",
				exact: true,
			})
			.click();
		const request = await submitted;
		expect(request.method()).toBe("POST");
		expect(request.url()).toBe(`${baseURL}/sign-up`);
		expect(new URL(page.url()).search).toBe("");
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
	await page.goto("/splash");
	// Observe the real 10-second timer, including hydration, on slower CI hosts.
	await expect(page).toHaveURL(/\/fr$/, { timeout: 20_000 });
	expect(
		(await page.context().cookies()).some(
			(cookie) => cookie.name === "seen_splash",
		),
	).toBe(true);
	expect(errors).toEqual([]);
	const robots = await request.get("/robots.txt");
	expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
});

test("historical signup reuses the hydrated auth form in both languages", async ({
	browser,
	baseURL,
}) => {
	for (const locale of ["fr", "en"]) {
		const context = await browser.newContext({
			locale: locale === "fr" ? "fr-FR" : "en-GB",
			extraHTTPHeaders: { "Accept-Language": locale },
		});
		const page = await context.newPage();
		await page.goto(`${baseURL}/sign-up?returnTo=/${locale}/profile`);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(
			locale === "fr" ? "Inscription" : "Sign up",
		);
		await page
			.getByRole("button", {
				name: locale === "fr" ? "Connexion" : "Sign in",
				exact: true,
			})
			.click();
		await expect(page.locator('input[name="name"]')).toHaveCount(0);
		await expect(page.locator('input[name="password"]')).toHaveAttribute(
			"autocomplete",
			"current-password",
		);
		await page
			.getByRole("button", {
				name: locale === "fr" ? "Inscription" : "Sign up",
				exact: true,
			})
			.click();
		await expect(page.locator('input[name="name"]')).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`returnTo=.*${locale}.*profile`));
		await page.goto(`${baseURL}/${locale}/sign-in`);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(
			locale === "fr" ? "Connexion" : "Sign in",
		);
		await expect(page.locator('input[name="name"]')).toHaveCount(0);
		await context.close();
	}
});
