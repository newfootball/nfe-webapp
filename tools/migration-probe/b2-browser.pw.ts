import { type Browser, chromium, devices } from "playwright";
import { assert } from "./b2-guards";

// No test runner, tracing, HAR, screenshots or console/network logging: URLs are secrets.
export async function openBrowser() {
	return chromium.launch({
		headless: true,
		channel:
			process.env.B2_PROBE_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
	});
}

export async function browserTransfers(
	browser: Browser,
	origin: string,
	nonce: string,
	keys: Record<string, string>,
	uploadId: string,
	abortId: string,
) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await page.goto(origin);
		return await page.evaluate(
			async ({ nonce, keys, uploadId, abortId }) => {
				const check = (ok: unknown, code: string) => {
					if (!ok) throw new Error(code);
				};
				const sign = async (value: object) => {
					const response = await fetch("/sign", {
						method: "POST",
						headers: {
							"x-probe-nonce": nonce,
							"content-type": "application/json",
						},
						body: JSON.stringify(value),
					});
					check(response.ok, "signer_failed");
					return (await response.json()).url as string;
				};
				const fixture = async (name: string) =>
					new Uint8Array(
						await (
							await fetch(`/fixture/${name}`, {
								headers: { "x-probe-nonce": nonce },
							})
						).arrayBuffer(),
					);
				const hash = async (bytes: Uint8Array) =>
					Array.from(
						new Uint8Array(
							await crypto.subtle.digest("SHA-256", bytes as BufferSource),
						),
						(v) => v.toString(16).padStart(2, "0"),
					).join("");
				const small = await fixture("small");
				const put = await fetch(
					await sign({ action: "put", key: keys.small }),
					{
						method: "PUT",
						body: small,
						headers: { "content-type": "application/octet-stream" },
					},
				);
				check(put.ok && put.headers.get("etag"), "cors_put_or_etag_failed");
				const get = await fetch(await sign({ action: "get", key: keys.small }));
				const downloaded = new Uint8Array(await get.arrayBuffer());
				check(
					get.ok && (await hash(downloaded)) === (await hash(small)),
					"browser_get_hash_failed",
				);
				const head = await fetch(
					await sign({ action: "head", key: keys.small }),
					{ method: "HEAD" },
				);
				check(
					head.ok &&
						Number(head.headers.get("content-length")) === small.length,
					"cors_head_failed",
				);
				const multipart = await fixture("multipart");
				const part = async (
					key: string,
					id: string,
					number: number,
					bytes: Uint8Array,
				) => {
					const result = await fetch(
						await sign({
							action: "part",
							key,
							uploadId: id,
							partNumber: number,
						}),
						{
							method: "PUT",
							body: bytes.slice().buffer,
							headers: { "content-type": "application/octet-stream" },
						},
					);
					const etag = result.headers.get("etag");
					check(result.ok && etag, "cors_part_failed");
					return { PartNumber: number, ETag: etag as string };
				};
				const first = await part(
					keys.multipart,
					uploadId,
					1,
					multipart.slice(0, 5 * 1024 * 1024),
				);
				// Resume is checked server-side with ListParts before this context is closed.
				const abortPart = await part(
					keys.abort,
					abortId,
					1,
					multipart.slice(0, 5 * 1024 * 1024),
				);
				const video = await fixture("video");
				const videoPut = await fetch(
					await sign({ action: "put", key: keys.video }),
					{
						method: "PUT",
						body: video,
						headers: { "content-type": "video/mp4" },
					},
				);
				check(videoPut.ok, "video_put_failed");
				return {
					put: put.status,
					get: get.status,
					head: head.status,
					etagExposed: true,
					smallSha256: await hash(small),
					first,
					abortPart,
					videoPut: videoPut.status,
				};
			},
			{ nonce, keys, uploadId, abortId },
		);
	} finally {
		await context.close();
	}
}

export async function resumeBrowser(
	browser: Browser,
	origin: string,
	nonce: string,
	key: string,
	uploadId: string,
) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await page.goto(origin);
		return await page.evaluate(
			async ({ nonce, key, uploadId }) => {
				const bytes = await (
					await fetch("/fixture/multipart", {
						headers: { "x-probe-nonce": nonce },
					})
				).arrayBuffer();
				const parts = [];
				for (const number of [1, 2]) {
					const signed = await fetch("/sign", {
						method: "POST",
						headers: {
							"x-probe-nonce": nonce,
							"content-type": "application/json",
						},
						body: JSON.stringify({
							action: "part",
							key,
							uploadId,
							partNumber: number,
						}),
					});
					if (!signed.ok) throw new Error("resume_sign_failed");
					const { url } = await signed.json();
					const response = await fetch(url, {
						method: "PUT",
						body: bytes.slice(
							(number - 1) * 5 * 1024 * 1024,
							number * 5 * 1024 * 1024,
						),
						headers: { "content-type": "application/octet-stream" },
					});
					const etag = response.headers.get("etag");
					if (!response.ok || !etag) throw new Error("resume_part_failed");
					parts.push({ PartNumber: number, ETag: etag });
				}
				return parts;
			},
			{ nonce, key, uploadId },
		);
	} finally {
		await context.close();
	}
}

export async function browserVideo(
	browser: Browser,
	origin: string,
	nonce: string,
	key: string,
	mobile: boolean,
) {
	const context = await browser.newContext(mobile ? devices["Pixel 7"] : {});
	try {
		const page = await context.newPage();
		await page.goto(origin);
		const result = await page.evaluate(
			async ({ nonce, key }) => {
				const signed = await fetch("/sign", {
					method: "POST",
					headers: {
						"x-probe-nonce": nonce,
						"content-type": "application/json",
					},
					body: JSON.stringify({ action: "get", key }),
				});
				if (!signed.ok) throw new Error("video_sign_failed");
				const { url } = await signed.json();
				const range = await fetch(url, { headers: { range: "bytes=0-1023" } });
				const contentRange = range.headers.get("content-range");
				await range.arrayBuffer();
				const video = document.createElement("video");
				video.muted = true;
				video.playsInline = true;
				video.crossOrigin = "anonymous";
				document.body.append(video);
				const wait = (event: string) =>
					new Promise<void>((resolve, reject) => {
						const timer = setTimeout(
							() => reject(new Error("video_timeout")),
							15000,
						);
						video.addEventListener(
							event,
							() => {
								clearTimeout(timer);
								resolve();
							},
							{ once: true },
						);
						video.addEventListener(
							"error",
							() => {
								clearTimeout(timer);
								reject(new Error("video_decode_failed"));
							},
							{ once: true },
						);
					});
				const metadata = wait("loadedmetadata");
				video.src = url;
				await metadata;
				const duration = video.duration;
				await video.play();
				await new Promise((resolve) => setTimeout(resolve, 400));
				const played = video.currentTime > 0;
				video.pause();
				const seek = wait("seeked");
				video.currentTime = 3;
				await seek;
				const result = {
					duration,
					width: video.videoWidth,
					height: video.videoHeight,
					played,
					seekTime: video.currentTime,
					rangeStatus: range.status,
					contentRange,
				};
				video.removeAttribute("src");
				video.load();
				video.remove();
				return result;
			},
			{ nonce, key },
		);
		assert(
			result.played &&
				result.duration >= 5 &&
				Math.abs(result.seekTime - 3) < 0.2 &&
				result.rangeStatus === 206 &&
				result.contentRange?.startsWith("bytes 0-1023/"),
			"video_evidence_failed",
		);
		return result;
	} finally {
		await context.close();
	}
}
