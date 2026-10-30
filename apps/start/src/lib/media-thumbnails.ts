export const FRAME_FRACTIONS = [0.1, 0.25, 0.5, 0.75, 0.9] as const;
function canvasFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob?.type === "image/webp"
					? resolve(new File([blob], name, { type: "image/webp" }))
					: reject(new Error("invalid")),
			"image/webp",
			0.85,
		),
	);
}
function draw(source: CanvasImageSource, width: number, height: number) {
	if (!width || !height) throw new Error("invalid");
	const scale = Math.min(1, 1920 / Math.max(width, height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const context = canvas.getContext("2d");
	if (!context) throw new Error("unavailable");
	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return canvas;
}
export async function imageToWebp(file: File): Promise<File> {
	const image = await createImageBitmap(file);
	try {
		return await canvasFile(
			draw(image, image.width, image.height),
			"image.webp",
		);
	} finally {
		image.close();
	}
}
function event(target: HTMLVideoElement, name: string, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			target.removeEventListener(name, ready);
			target.removeEventListener("error", failed);
			signal.removeEventListener("abort", aborted);
			clearTimeout(timer);
		};
		const ready = () => {
			cleanup();
			resolve();
		};
		const failed = () => {
			cleanup();
			reject(new Error("invalid"));
		};
		const aborted = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		const timer = setTimeout(failed, 15_000);
		target.addEventListener(name, ready, { once: true });
		target.addEventListener("error", failed, { once: true });
		signal.addEventListener("abort", aborted, { once: true });
		if (signal.aborted) aborted();
	});
}
export async function videoFrames(
	file: File,
	signal: AbortSignal,
): Promise<File[]> {
	const url = URL.createObjectURL(file),
		video = document.createElement("video");
	video.muted = true;
	video.preload = "auto";
	try {
		const loaded = event(video, "loadeddata", signal);
		video.src = url;
		await loaded;
		if (!Number.isFinite(video.duration) || video.duration <= 0)
			throw new Error("invalid");
		const frames: File[] = [];
		for (const fraction of FRAME_FRACTIONS) {
			signal.throwIfAborted();
			const seeked = event(video, "seeked", signal);
			video.currentTime = video.duration * fraction;
			await seeked;
			frames.push(
				await canvasFile(
					draw(video, video.videoWidth, video.videoHeight),
					`frame-${fraction}.webp`,
				),
			);
		}
		return frames;
	} finally {
		video.removeAttribute("src");
		video.load();
		URL.revokeObjectURL(url);
	}
}
