import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const f = JSON.parse(
	await readFile(process.env.NFE_REHEARSAL_FIXTURE!, "utf8"),
) as {
	ownerId: string;
	adminId: string;
	peerName: string;
	publishedPostId: string;
	draftPostId: string;
	secret: string;
};
const origin = "http://127.0.0.1:3564";
const unavailable = {
	fr: "La vidéo est indisponible. Réessayez dans un instant.",
	en: "This video is unavailable. Try again in a moment.",
};

test("imported data on the integrated local runtime", async ({
	page,
	context,
}) => {
	for (const locale of ["fr", "en"] as const) {
		await page.goto(`/${locale}/feed`);
		await expect(page.locator("main")).toBeVisible();
		await page.goto(`/${locale}/user/${f.adminId}`);
		await expect(page.getByTestId("profile-name")).toHaveText(f.adminId);
		await page.goto(`/${locale}/post/${f.publishedPostId}`);
		const card = page.locator(`[data-post-id="${f.publishedPostId}"]`);
		await expect(card).toBeVisible();
		await card
			.getByRole("button", {
				name: locale === "fr" ? "Lire la vidéo" : "Play video",
				exact: true,
			})
			.click();
		await expect(card.getByText(unavailable[locale])).toBeVisible();
		const draft = await page.goto(`/${locale}/post/${f.draftPostId}`);
		expect(draft?.status()).toBe(404);
		await expect(page.locator(`[data-post-id="${f.draftPostId}"]`)).toHaveCount(
			0,
		);
	}
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: f.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	for (const locale of ["fr", "en"] as const) {
		await page.goto(`/${locale}/private`);
		await expect(page.getByTestId("identity")).toHaveText(f.ownerId);
		// Drafts stay private even to their owner on the public post page.
		const draft = await page.goto(`/${locale}/post/${f.draftPostId}`);
		expect(draft?.status()).toBe(404);
		await page.goto(`/${locale}/messages`);
		await expect(page.getByText(f.peerName).first()).toBeVisible();
		await page.goto(`/${locale}/notifications`);
		await expect(page.getByTestId("notification-item").first()).toBeVisible();
	}
});
