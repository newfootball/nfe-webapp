"use server";

import { uploadToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/query/user.query";
import { MediaType, PostType } from "@prisma/client";
import { type PostData, postSchema } from "./post.schema";

export const savePost = async (post: PostData) => {
	const user = await getUserSession();

	if (!user?.id) {
		throw new Error("User not found");
	}

	const result = postSchema.safeParse(post);
	if (!result.success) {
		throw new Error(result.error.errors[0].message);
	}

	const newPost = await prisma.post.create({
		data: {
			title: post.title,
			description: post.description,
			userId: user.id,
			slug: post.title.toLowerCase().replace(/ /g, "-"),
			type: PostType.video,
		},
	});

	const imageUrl = await saveMedia({
		mediaFile: post.image,
		postId: newPost.id,
		type: MediaType.landingImage,
	});

	const videoUrl = await saveMedia({
		mediaFile: post.video,
		postId: newPost.id,
		type: MediaType.mainVideo,
	});

	console.log({ imageUrl, videoUrl });

	return newPost;
};

const saveMedia = async ({
	mediaFile,
	postId,
	type,
}: {
	mediaFile?: File | null | undefined;
	postId: string;
	type: MediaType;
}) => {
	if (!mediaFile) return null;

	const upload = await uploadToMinio(mediaFile);

	console.log("upload", upload);

	if (!upload) return null;

	const media = await prisma.media.create({
		data: {
			url: upload.etag,
			postId: postId,
			mimetype: mediaFile.type,
			type: type,
			filename: mediaFile.name,
		},
	});

	return media;
};
