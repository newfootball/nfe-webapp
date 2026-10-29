import { MEDIA_PART_BYTES } from "./media-contract";

export function expectedPartBytes(size: number, number: number) {
	if (
		!Number.isSafeInteger(size) ||
		size < 1 ||
		!Number.isInteger(number) ||
		number < 1 ||
		number > Math.ceil(size / MEDIA_PART_BYTES)
	)
		throw new Error("Invalid part");
	return Math.min(MEDIA_PART_BYTES, size - (number - 1) * MEDIA_PART_BYTES);
}
export function inspectParts(
	size: number,
	parts: { PartNumber?: number; Size?: number; ETag?: string }[],
	complete = false,
) {
	const seen = new Set<number>();
	const result = parts
		.map((p) => {
			if (
				!p.PartNumber ||
				seen.has(p.PartNumber) ||
				!p.ETag ||
				p.Size !== expectedPartBytes(size, p.PartNumber)
			)
				throw new Error("Invalid part");
			seen.add(p.PartNumber);
			return { number: p.PartNumber, bytes: p.Size, etag: p.ETag };
		})
		.sort((a, b) => a.number - b.number);
	if (complete && result.length !== Math.ceil(size / MEDIA_PART_BYTES))
		throw new Error("Incomplete upload");
	return result;
}
export function inspectContent(
	kind: string,
	value: unknown,
	maxDuration: number,
) {
	const p = value as {
		streams?: {
			codec_type?: string;
			codec_name?: string;
			pix_fmt?: string;
			width?: number;
			height?: number;
		}[];
		format?: { format_name?: string; duration?: string };
	};
	if (!Array.isArray(p.streams) || p.streams.length < 1 || p.streams.length > 2)
		throw new Error("Invalid streams");
	const videos = p.streams.filter((s) => s.codec_type === "video"),
		v = videos[0];
	if (
		videos.length !== 1 ||
		!v?.width ||
		!v.height ||
		v.width > (kind === "video" ? 3840 : 2048) ||
		v.height > (kind === "video" ? 2160 : 2048)
	)
		throw new Error("Invalid dimensions");
	if (kind === "video") {
		const duration = Number(p.format?.duration);
		if (
			v.codec_name !== "h264" ||
			v.pix_fmt !== "yuv420p" ||
			!p.format?.format_name?.split(",").includes("mp4") ||
			!Number.isFinite(duration) ||
			duration <= 0 ||
			duration > maxDuration ||
			p.streams.some(
				(s) =>
					s.codec_type !== "video" &&
					!(s.codec_type === "audio" && s.codec_name === "aac"),
			)
		)
			throw new Error("Unsupported video");
		return {
			width: v.width,
			height: v.height,
			duration,
			codec: "h264",
			audio: p.streams.some((s) => s.codec_type === "audio"),
		};
	}
	if (
		p.streams.length !== 1 ||
		v.codec_name !== "webp" ||
		p.format?.format_name !== "webp_pipe"
	)
		throw new Error("Unsupported image");
	return { width: v.width, height: v.height, codec: "webp" };
}
