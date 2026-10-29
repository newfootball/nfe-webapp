import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	devices,
	expect,
	type Locator,
	type Page,
	test,
} from "@playwright/test";
import { mediaMessages } from "../src/lib/media-messages";

/**
 * Author runner integration (not the public shell smoke configuration):
 * - Include this file in playwright.media.config.ts, workers=1, retries=0,
 *   baseURL=http://127.0.0.1:3555; keep trace/screenshot/video OFF.
 * - Run media.pw.ts FIRST, then this file, before media-proof.ts cleanup.
 *   That runner supplies isolated Appwrite, real private B2/CORS, existing
 *   START_APPWRITE and B2 variables, and START_MEDIA_READ_TTL_SECONDS=3.
 * - media-fixtures.ts supplies fixture.json actors[{id,secret,password}],
 *   video.mp4 (12s H264/yuv420p/AAC, >1 multipart part), thumbnail.webp.
 *   The RPC suite supplies published.json {post:{id,slug},assetId,thumbnailId}
 *   for independent engine tests; no hand-written credentials are needed.
 * - Install matching Playwright Chrome and WebKit before running. Pixel 7 is
 *   Chromium emulation, not a physical Android device. Codec failures FAIL.
 *
 * These tests mutate only runner-owned synthetic fixtures. Cleanup belongs to
 * media-proof.ts AFTER all suites. Do not log fixture data or signed URLs.
 * No RPC helper uploads/publications are used as mounted-component evidence.
 */
const origin = "http://127.0.0.1:3555";
const state = fileURLToPath(
	new URL("../scripts/.media-local/", import.meta.url),
);
const videoPath = `${state}video.mp4`;
const imagePath = `${state}thumbnail.webp`;
type Actor = { id: string; secret: string };
type Locale = "fr" | "en";

async function actors(): Promise<Actor[]> {
	// Runtime only: collecting/typechecking this file never opens private state.
	const fixture = JSON.parse(await readFile(`${state}fixture.json`, "utf8"));
	return fixture.actors;
}
async function authenticate(page: Page, actorIndex = 0) {
	const actor = (await actors())[actorIndex];
	if (!actor) throw new Error("Author runner actor fixture is missing");
	await page.context().addCookies([
		{
			name: "nfe-session-dev",
			value: encodeURIComponent(actor.secret),
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
}
function sections(page: Page, locale: Locale) {
	const t = mediaMessages[locale];
	return {
		video: page.getByRole("group", { name: `01 · ${t.video}`, exact: true }),
		cover: page.getByRole("group", {
			name: `02 · ${t.thumbnail}`,
			exact: true,
		}),
	};
}
async function openPublication(page: Page, locale: Locale) {
	await authenticate(page);
	// Prime the mounted feed Query cache, then enter PublishForm by its link.
	await page.goto(`/${locale}/feed`);
	await page.getByRole("link", { name: mediaMessages[locale].publish }).click();
	await expect(
		page.getByRole("heading", { name: mediaMessages[locale].publish }),
	).toBeVisible();
	return sections(page, locale);
}
async function selectVideo(page: Page, locale: Locale) {
	const { video, cover } = sections(page, locale);
	await video.getByLabel(mediaMessages[locale].choose).setInputFiles(videoPath);
	await expect(cover.getByRole("radio")).toHaveCount(5);
	return { video, cover };
}
async function upload(section: Locator, locale: Locale) {
	const t = mediaMessages[locale];
	await section.getByRole("button", { name: t.upload, exact: true }).click();
	await expect(section.getByRole("status")).toHaveText(t.phases.ready, {
		timeout: 120_000,
	});
	await expect(section.getByRole("progressbar")).toHaveAttribute(
		"value",
		"100",
	);
}

// Hold a real signed PUT before sending it. Pause/cancel must abort the mounted
// XHR; the held request is never fulfilled as a fake successful storage write.
const partPattern = /[?&]partNumber=\d+/;
async function holdPart(page: Page, partNumber: number) {
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let entered = false;
	await page.route(partPattern, async (route) => {
		const request = route.request();
		if (
			request.method() !== "PUT" ||
			Number(new URL(request.url()).searchParams.get("partNumber")) !==
				partNumber ||
			entered
		) {
			await route.fallback();
			return;
		}
		entered = true;
		await gate;
		await route.abort("aborted").catch(() => {});
	});
	return { entered: () => entered, release };
}

test.describe("mounted synthetic media workflows", () => {
	test.setTimeout(240_000);
	for (const locale of ["fr", "en"] as const) {
		test(`PublishForm ${locale}: five covers, manual replacement, publish and feed refresh`, async ({
			page,
		}) => {
			const t = mediaMessages[locale];
			await openPublication(page, locale);
			const { video, cover } = await selectVideo(page, locale);
			await expect(
				page.getByRole("button", { name: t.submit, exact: true }),
			).toBeDisabled();
			for (const percent of [10, 25, 50, 75, 90]) {
				const choice = cover.getByRole("radio", {
					name: new RegExp(`${t.frame} ${percent}%`),
				});
				// Radio is visually hidden; click its visible wrapping label/image.
				await cover
					.getByRole("img", { name: `${t.frame} ${percent}%`, exact: true })
					.click();
				await expect(choice).toBeChecked();
				await expect(cover.locator('input[type="radio"]:checked')).toHaveCount(
					1,
				);
			}
			await upload(cover, locale);
			const generatedPreview = await cover
				.getByRole("img", { name: t.thumbnail, exact: true })
				.getAttribute("src");
			await cover.getByLabel(t.manual).setInputFiles(imagePath);
			await expect(cover.locator('input[type="radio"]:checked')).toHaveCount(0);
			await expect
				.poll(
					async () =>
						(await cover
							.getByRole("img", { name: t.thumbnail, exact: true })
							.getAttribute("src")) !== generatedPreview,
				)
				.toBe(true);
			// Manual cover replaces an already uploaded generated cover.
			await upload(cover, locale);
			await upload(video, locale);
			const title = `Mounted ${locale} ${crypto.randomUUID()}`;
			await page.getByLabel(t.title, { exact: true }).fill(title);
			await page
				.locator('textarea[name="description"]')
				.fill("Synthetic mounted UI publication");
			await page.getByRole("button", { name: t.submit, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/post/[^/]+$`));
			const detailPath = new URL(page.url()).pathname;
			await expect(
				page.getByRole("heading", { name: title, exact: true }),
			).toBeVisible();
			await expect(page.locator("article video")).toHaveAttribute(
				"poster",
				/\/post-media\/.+\/thumbnail/,
			);
			await page
				.getByRole("navigation", {
					name:
						locale === "fr" ? "Publications et recherche" : "Posts and search",
				})
				.getByRole("link", {
					name: locale === "fr" ? "Publications" : "Posts",
					exact: true,
				})
				.click();
			const published = page.getByRole("link", { name: title, exact: true });
			await expect(published).toBeVisible(); // revisits primed cache after mutation
			await page.reload();
			await expect(published).toBeVisible(); // server persistence, not only cache
			await published.click();
			await expect(page).toHaveURL(`${origin}${detailPath}`);
			await expect(
				page.getByText("Synthetic mounted UI publication", { exact: true }),
			).toBeVisible();
		});
	}

	test("TransferStatus: real multipart progress, pause/resume, transient failure/retry and cancel", async ({
		page,
	}) => {
		const t = mediaMessages.en;
		await openPublication(page, "en");
		const { video } = await selectVideo(page, "en");
		const held = await holdPart(page, 2);
		try {
			await video.getByRole("button", { name: t.upload, exact: true }).click();
			await expect.poll(held.entered, { timeout: 120_000 }).toBe(true);
			await expect
				.poll(async () =>
					Number(await video.getByRole("progressbar").getAttribute("value")),
				)
				.toBeGreaterThan(0);
			await video.getByRole("button", { name: t.pause, exact: true }).click();
			await expect(video.getByRole("status")).toHaveText(t.phases.paused);
		} finally {
			held.release();
		}
		await page.unrouteAll({ behavior: "wait" });
		let failed = false;
		await page.route(partPattern, async (route) => {
			if (route.request().method() === "PUT" && !failed) {
				failed = true;
				await route.fulfill({
					status: 503,
					body: "Synthetic transient transport failure",
				});
			} else await route.fallback();
		});
		await video.getByRole("button", { name: t.resume, exact: true }).click();
		await expect(video.getByRole("status")).toHaveText(t.phases.error);
		expect(failed).toBe(true);
		await expect(video.getByRole("alert")).toBeVisible();
		await video.getByRole("button", { name: t.retry, exact: true }).click();
		await expect(video.getByRole("status")).toHaveText(t.phases.ready, {
			timeout: 120_000,
		});
		await expect(video.getByRole("progressbar")).toHaveAttribute(
			"value",
			"100",
		);
		await video.getByRole("button", { name: t.cancel, exact: true }).click();
		await expect(video.getByLabel(t.choose)).toBeEnabled();
		await page.unrouteAll({ behavior: "wait" });
		await selectVideo(page, "en");
		const cancelled = await holdPart(page, 1);
		try {
			await video.getByRole("button", { name: t.upload, exact: true }).click();
			await expect.poll(cancelled.entered).toBe(true);
			await video.getByRole("button", { name: t.cancel, exact: true }).click();
			await expect(video.getByLabel(t.choose)).toBeEnabled();
			await expect(video.getByRole("progressbar")).toHaveCount(0);
			await expect(
				page.getByRole("button", { name: t.submit, exact: true }),
			).toBeDisabled();
		} finally {
			cancelled.release();
		}
	});

	test("AvatarEditor: two mounted replacements survive editor and public-profile reload", async ({
		page,
	}) => {
		const t = mediaMessages.en;
		await authenticate(page);
		await page.goto("/en/profile/edit-user");
		const editor = page.getByRole("region", { name: t.avatar, exact: true });
		let previous = await editor.getByRole("img").getAttribute("src");
		for (let replacement = 0; replacement < 2; replacement++) {
			await editor.getByLabel(t.choose).setInputFiles(imagePath);
			await expect(editor.getByRole("img")).toHaveAttribute("src", /^blob:/);
			await upload(editor, "en");
			await editor
				.getByRole("button", { name: t.saveAvatar, exact: true })
				.click();
			await expect(editor.getByRole("status")).toHaveText(t.saved);
			await expect(editor.getByRole("img")).toHaveAttribute(
				"src",
				/^\/media\//,
			);
			const current = await editor.getByRole("img").getAttribute("src");
			expect(current !== previous).toBe(true);
			await page.reload();
			await expect(editor.getByRole("img")).toHaveAttribute(
				"src",
				current ?? "",
			);
			await page.goto("/en/user/media-actor-0");
			const avatar = page.locator("article img").first();
			await expect(avatar).toHaveAttribute("src", current ?? "");
			await expect
				.poll(() =>
					avatar.evaluate(
						(img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
					),
				)
				.toBe(true);
			await page.goto("/en/profile/edit-user");
			previous = current;
		}
	});

	test("identity change disposes an in-flight mounted transfer", async ({
		page,
	}) => {
		await openPublication(page, "en");
		const { video } = await selectVideo(page, "en");
		const held = await holdPart(page, 1);
		try {
			await video.getByRole("button", { name: "Upload", exact: true }).click();
			await expect.poll(held.entered).toBe(true);
			await authenticate(page, 1);
			// Invoke the existing focus listener; the identity service is real.
			await page.evaluate(() => window.dispatchEvent(new Event("focus")));
			await expect(page.getByRole("alert")).toHaveText(
				mediaMessages.en.identity,
			);
			await expect(page.locator('input[type="file"]')).toHaveCount(0);
			held.release();
			await page.unrouteAll({ behavior: "wait" });
			await expect(
				page.getByRole("button", { name: "Publish", exact: true }),
			).toHaveCount(0);
		} finally {
			held.release();
		}
	});
});

async function playbackProof(page: Page, locale: Locale) {
	const fixture = JSON.parse(await readFile(`${state}published.json`, "utf8"));
	await page.goto(`/${locale}/post/${fixture.post.id}`);
	const player = page.locator("article video");
	await expect(player).toHaveAttribute("controls", "");
	await expect(player).toHaveAttribute("playsinline", "");
	await player.evaluate((element: HTMLVideoElement) => {
		element.muted = true;
	});
	await page
		.getByRole("button", { name: mediaMessages[locale].play, exact: true })
		.click();
	await expect
		.poll(
			() =>
				player.evaluate(
					(element: HTMLVideoElement) =>
						element.readyState >= 2 && !element.paused,
				),
			{ timeout: 30_000 },
		)
		.toBe(true);
	// Use actual native media methods/properties: no fabricated media events,
	// source substitution, fake clocks or stubbed readPostMedia responses.
	await player.evaluate((element: HTMLVideoElement) => {
		element.pause();
		element.currentTime = 3;
	});
	await expect
		.poll(() =>
			player.evaluate(
				(element: HTMLVideoElement) =>
					Math.abs(element.currentTime - 3) < 0.3 && !element.seeking,
			),
		)
		.toBe(true);
	const pausedSource = await player.evaluate(
		(element: HTMLVideoElement) => element.currentSrc,
	);
	await expect
		.poll(
			() =>
				player.evaluate(
					(element: HTMLVideoElement, previous) =>
						element.currentSrc !== previous && element.readyState >= 2,
					pausedSource,
				),
			{ timeout: 15_000 },
		)
		.toBe(true);
	await expect
		.poll(() =>
			player.evaluate(
				(element: HTMLVideoElement) =>
					element.paused && Math.abs(element.currentTime - 3) < 0.3,
			),
		)
		.toBe(true);
	await player.evaluate(async (element: HTMLVideoElement) => {
		element.currentTime = 5;
		await element.play();
	});
	const playingSource = await player.evaluate(
		(element: HTMLVideoElement) => element.currentSrc,
	);
	await expect
		.poll(
			() =>
				player.evaluate(
					(element: HTMLVideoElement, previous) =>
						element.currentSrc !== previous &&
						element.readyState >= 2 &&
						!element.paused &&
						element.currentTime >= 5 &&
						element.currentTime < 9,
					playingSource,
				),
			{ timeout: 15_000 },
		)
		.toBe(true);
	await expect(page.getByRole("alert")).toHaveCount(0);
}

test.describe("mounted MediaPlayer engines (requires author published.json and TTL=3)", () => {
	test.setTimeout(90_000);
	test("Chrome desktop: native seek and renewal preserve paused and playing state", async ({
		page,
		browser,
	}, info) => {
		info.annotations.push({
			type: "engine",
			description: `Desktop ${browser.browserType().name()} ${browser.version()}`,
		});
		await playbackProof(page, "fr");
	});
	test("Pixel 7 Chromium emulation: mobile EN player and renewal", async ({
		browser,
	}, info) => {
		expect(browser.browserType().name()).toBe("chromium");
		const context = await browser.newContext({
			...devices["Pixel 7"],
			baseURL: origin,
		});
		try {
			info.annotations.push({
				type: "engine",
				description: `Pixel 7 emulation, Chromium ${browser.version()}; no physical device proof`,
			});
			const page = await context.newPage();
			await playbackProof(page, "en");
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true);
		} finally {
			await context.close();
		}
	});
	test("WebKit: native codec playback, seek and renewal", async ({
		playwright,
	}, info) => {
		const browser = await playwright.webkit.launch({ headless: true });
		try {
			info.annotations.push({
				type: "engine",
				description: `Playwright WebKit ${browser.version()}; not Safari on physical hardware`,
			});
			const page = await browser.newPage({ baseURL: origin });
			await playbackProof(page, "fr");
		} finally {
			await browser.close();
		}
	});
});
