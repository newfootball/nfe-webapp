"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import { MediaType, PostStatus, PostType } from "@/src/generated/prisma/enums";
import { getSession } from "@/src/lib/auth-server";
import { createUniquePostSlug } from "@/src/lib/post-slug";
import { type PostData, postSchema } from "./post.schema";

async function postSlugExists(slug: string) {
	const existingPost = await prisma.post.findUnique({
		where: { slug },
		select: { id: true },
	});

	return Boolean(existingPost);
}

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

	const slug = await createUniquePostSlug(post.title, postSlugExists);

	const newPost = await prisma.post.create({
		data: {
			title: post.title,
			description: post.description,
			userId: session.user.id,
			slug,
			type: PostType.video,
			status: PostStatus.PUBLISHED,
			medias: {
				create: [
					{
						url: post.videoUrl,
						mimetype: post.videoMimeType,
						type: MediaType.mainVideo,
						filename: post.videoPublicId,
						label: post.videoPublicId,
						metadata: (post.videoMetadata ?? {}) as Prisma.InputJsonValue,
					},
					...(post.imagePublicId && post.imageUrl
						? [
								{
									url: post.imageUrl,
									mimetype: post.imageMimeType ?? "image/jpeg",
									type: MediaType.landingImage,
									filename: post.imagePublicId,
									label: post.imagePublicId,
									metadata: (post.imageMetadata ?? {}) as Prisma.InputJsonValue,
								},
							]
						: []),
				],
			},
		},
	});

	return newPost;
};
