import { expect, type Page, test } from "@playwright/test";

const ttl = 120_000;

async function videoPostId(page: Page) {
	if (process.env.SMOKE_VIDEO_POST_ID) return process.env.SMOKE_VIDEO_POST_ID;
	const html = await (await page.request.get("/fr")).text();
	const ids = [
		...new Set(
			[...html.matchAll(/post-media\/([A-Za-z0-9]+)\/thumbnail/g)].map(
				(match) => match[1],
			),
		),
	];
	for (const id of ids) {
		const response = await page.request.get(`/post-media/${id}/video`, {
			maxRedirects: 0,
		});
		if (response.status() === 307) return id;
	}
	throw new Error("No public video post on the home page");
}

function source(page: Page) {
	return page.evaluate(() => {
		const video = document.querySelector("video");
		if (!video?.currentSrc) return null;
		const url = new URL(video.currentSrc);
		return {
			host: url.host,
			signedAt: url.searchParams.get("X-Amz-Date"),
			expires: url.searchParams.get("X-Amz-Expires"),
			ready: video.readyState,
			error: video.error?.code ?? null,
		};
	});
}

test("production media: signed B2 links renew before expiry and after the network returns", async ({
	page,
	context,
}) => {
	test.setTimeout(6 * 60_000);
	const id = await videoPostId(page);
	const signed: string[] = [];
	page.on("response", (response) => {
		const url = new URL(response.url());
		if (url.host.endsWith(".backblazeb2.com"))
			signed.push(`${response.status()}`);
	});

	await page.goto(`/fr/post/${id}`);
	await page.getByRole("button", { name: "Lire la vidéo" }).first().click();
	await expect
		.poll(async () => (await source(page))?.ready ?? 0)
		.toBeGreaterThan(0);
	const first = await source(page);
	expect(first?.host).toMatch(/\.backblazeb2\.com$/);
	expect(first?.expires).toBe(`${ttl / 1000}`);
	expect(first?.error).toBeNull();

	await expect
		.poll(async () => (await source(page))?.signedAt, {
			timeout: ttl,
			intervals: [2_000],
		})
		.not.toBe(first?.signedAt);
	const renewed = await source(page);
	expect(renewed?.host).toMatch(/\.backblazeb2\.com$/);
	expect(renewed?.error).toBeNull();
	await expect(page.getByRole("alert")).toHaveCount(0);

	await context.setOffline(true);
	await page.waitForTimeout(ttl + 5_000);
	await context.setOffline(false);
	await page.evaluate(() => {
		const video = document.querySelector("video");
		if (video) video.currentTime = 0;
	});
	await expect
		.poll(async () => (await source(page))?.signedAt, { timeout: 20_000 })
		.not.toBe(renewed?.signedAt);
	await expect
		.poll(async () => (await source(page))?.ready ?? 0)
		.toBeGreaterThan(0);
	expect((await source(page))?.error).toBeNull();
	await expect(page.getByRole("alert")).toHaveCount(0);
	expect(signed.every((status) => status === "200" || status === "206")).toBe(
		true,
	);
});
