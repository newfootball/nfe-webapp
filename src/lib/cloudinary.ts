/**
 * Adds f_webp,q_auto transformations to Cloudinary image URLs.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function toCloudinaryWebP(
	url: string | null | undefined,
): string | undefined {
	if (!url) return undefined;
	if (!url.includes("res.cloudinary.com") || !url.includes("/upload/"))
		return url;
	return url.replace("/upload/", "/upload/f_webp,q_auto/");
}

/**
 * Converts an image File to WebP client-side using Canvas.
 * Falls back to the original file if conversion fails or is unsupported.
 */
export async function convertToWebP(file: File, quality = 0.85): Promise<File> {
	if (file.type === "image/webp") return file;
	if (!file.type.startsWith("image/")) return file;

	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new window.Image();
			image.onload = () => resolve(image);
			image.onerror = reject;
			image.src = url;
		});

		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) return file;
		ctx.drawImage(img, 0, 0);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/webp", quality),
		);
		if (!blob) return file;

		const name = file.name.replace(/\.[^/.]+$/, ".webp");
		return new File([blob], name, { type: "image/webp" });
	} catch {
		return file;
	} finally {
		URL.revokeObjectURL(url);
	}
}
