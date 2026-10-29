import { createServerFn } from "@tanstack/react-start";
import {
	allocateMedia,
	cancelMedia,
	finalizeMedia,
	publishMedia,
	readMedia,
	readPostMediaValue,
	replaceMediaAvatar,
	resumeMedia,
	signMediaPart,
} from "./media.server";
import {
	AllocateAssetSchema,
	AssetRequestSchema,
	PartRequestSchema,
	PostMediaRequestSchema,
	PublishPostSchema,
} from "./media-contract";

export const allocateAsset = createServerFn({ method: "POST" })
	.validator((v: unknown) => AllocateAssetSchema.parse(v))
	.handler(({ data }) => allocateMedia(data));
export const resumeAsset = createServerFn({ method: "POST" })
	.validator((v: unknown) => AssetRequestSchema.parse(v))
	.handler(({ data }) => resumeMedia(data));
export const signAssetPart = createServerFn({ method: "POST" })
	.validator((v: unknown) => PartRequestSchema.parse(v))
	.handler(({ data }) => signMediaPart(data));
export const finalizeAsset = createServerFn({ method: "POST" })
	.validator((v: unknown) => AssetRequestSchema.parse(v))
	.handler(({ data }) => finalizeMedia(data));
export const cancelAsset = createServerFn({ method: "POST" })
	.validator((v: unknown) => AssetRequestSchema.parse(v))
	.handler(({ data }) => cancelMedia(data));
export const publishPost = createServerFn({ method: "POST" })
	.validator((v: unknown) => PublishPostSchema.parse(v))
	.handler(({ data }) => publishMedia(data));
export const replaceAvatar = createServerFn({ method: "POST" })
	.validator((v: unknown) => AssetRequestSchema.parse(v))
	.handler(({ data }) => replaceMediaAvatar(data));
export const readAsset = createServerFn({ method: "GET" })
	.validator((v: unknown) => AssetRequestSchema.parse(v))
	.handler(({ data }) => readMedia(data));
export const readPostMedia = createServerFn({ method: "GET" })
	.validator((v: unknown) => PostMediaRequestSchema.parse(v))
	.handler(({ data }) => readPostMediaValue(data));
