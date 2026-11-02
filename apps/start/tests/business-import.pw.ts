import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const f = JSON.parse(
	await readFile(process.env.NFE_BUSINESS_QA_FIXTURE!, "utf8"),
) as {
	ownerId: string;
	secret: string;
	postId: string;
	missingPostId: string;
	fallbackProfileId: string;
};
const origin = "http://127.0.0.1:3563";

test("imported data, missing media and owner deletion", async ({
	page,
	context,
}) => {
	for (const locale of ["fr", "en"] as const) {
		await page.goto(`/${locale}/feed`);
		await expect(page.locator("main")).toBeVisible();
		await page.goto(`/${locale}/user/${f.fallbackProfileId}`);
		await expect(page.getByTestId("profile-name")).toBeVisible();
		await expect(page.locator('img[src="/logo.svg"]').first()).toBeVisible();
		await page.goto(`/${locale}/post/${f.missingPostId}`);
		const card = page.locator(`[data-post-id="${f.missingPostId}"]`);
		await expect(card).toBeVisible();
		await card
			.getByRole("button", {
				name: locale === "fr" ? "Lire la vidéo" : "Play video",
				exact: true,
			})
			.click();
		await expect(
			card.getByText(
				locale === "fr"
					? "La vidéo est indisponible. Réessayez dans un instant."
					: "This video is unavailable. Try again in a moment.",
			),
		).toBeVisible();
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
	await page.goto(`/fr/post/${f.postId}/edit`);
	await page
		.getByRole("button", { name: "Supprimer la publication", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Confirmer la suppression", exact: true })
		.click();
	const resume = page.getByRole("button", {
		name: "Reprendre le nettoyage",
		exact: true,
	});
	await expect(resume).toBeVisible({ timeout: 30000 });
	await resume.click();
	// The button changes its label while busy. Its old label disappearing does
	// not establish that the bounded cleanup loop reached durable completion.
	await expect(page).toHaveURL(/\/fr\/post\/my(?:[?#]|$)/, {
		timeout: 120000,
	});
});
