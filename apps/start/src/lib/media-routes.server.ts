import "@tanstack/react-start/server-only";
import { signedMedia, signedPostMedia } from "./media.server";
import { AssetIdSchema } from "./media-contract";

const headers = {
	"Cache-Control": "private, no-store",
	Vary: "Cookie",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};
export async function assetResponse(id: string) {
	try {
		const media = await signedMedia(AssetIdSchema.parse(id));
		return new Response(null, {
			status: 307,
			headers: { ...headers, Location: media.url },
		});
	} catch {
		return new Response(null, { status: 404, headers });
	}
}
export async function postMediaResponse(id: string, kind: string) {
	try {
		if (
			!/^[a-zA-Z0-9_-]{1,36}$/.test(id) ||
			(kind !== "video" && kind !== "thumbnail")
		)
			throw new Error("Invalid descriptor");
		const media = await signedPostMedia(id, kind);
		return new Response(null, {
			status: 307,
			headers: { ...headers, Location: media.url },
		});
	} catch {
		return new Response(null, { status: 404, headers });
	}
}
