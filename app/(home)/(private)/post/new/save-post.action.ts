"use server";

import { MediaType, PostStatus, PostType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/src/lib/auth-server";
import { type PostData, postSchema } from "./post.schema";

export const savePost = async (post: PostData) => {
	const session = await getSession();

	if (!session?.user?.id) {
		throw new Error("User not found");
	}

	const result = postSchema.safeParse(post);
	if (!result.success) {
		throw new Error(
			`Validation error: ${result.error.issues[0]?.message ?? "Unknown error"}`,
		);
	}

	const slug = post.title.toLowerCase().replace(/ /g, "-");

	let newPost = await prisma.post.findFirst({
		where: { slug, userId: session.user.id },
	});

	if (!newPost) {
		newPost = await prisma.post.create({
			data: {
				title: post.title,
				description: post.description,
				userId: session.user.id,
				slug,
				type: PostType.video,
				status: PostStatus.PUBLISHED,
			},
		});
	}

	await prisma.media.create({
		data: {
			url: post.videoUrl,
			postId: newPost.id,
			mimetype: post.videoMimeType,
			type: MediaType.mainVideo,
			filename: post.videoPublicId,
			label: post.videoPublicId,
			metadata: (post.videoMetadata ?? {}) as Prisma.InputJsonValue,
		},
	});

	if (post.imagePublicId && post.imageUrl) {
		await prisma.media.create({
			data: {
				url: post.imageUrl,
				postId: newPost.id,
				mimetype: post.imageMimeType ?? "image/jpeg",
				type: MediaType.landingImage,
				filename: post.imagePublicId,
				label: post.imagePublicId,
				metadata: (post.imageMetadata ?? {}) as Prisma.InputJsonValue,
			},
		});
	}

	return newPost;
};
