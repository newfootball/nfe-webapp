import "@tanstack/react-start/server-only";
import { signedMedia, signedPostMedia } from "./media.server";
import { AssetIdSchema, PostMediaRequestSchema } from "./media-contract";

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
		const input = PostMediaRequestSchema.parse({ postId: id, kind });
		const media = await signedPostMedia(input.postId, input.kind);
		return new Response(null, {
			status: 307,
			headers: { ...headers, Location: media.url },
		});
	} catch {
		return new Response(null, { status: 404, headers });
	}
}
