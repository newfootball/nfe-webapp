"use server";

import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { auth } from "@/src/lib/auth";
import { MediaType, PostStatus, PostType } from "@prisma/client";
import { type PostData, postSchema } from "./post.schema";

export const savePost = async (post: PostData) => {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("User not found");
  }

  const result = postSchema.safeParse(post);

  if (!result.success) {
    throw new Error(`Validation error: ${result.error.errors[0].message}`);
  }

  const slug = post.title.toLowerCase().replace(/ /g, "-");

  let newPost = await prisma.post.findUnique({
    where: {
      slug: slug,
    },
  });

  if (!newPost) {
    newPost = await prisma.post.create({
      data: {
        title: post.title,
        description: post.description,
        userId: session.user.id,
        slug: slug,
        type: PostType.video,
        status: PostStatus.DRAFT,
      },
    });
  }

  const [imageUrl, videoUrl] = await Promise.all([
    saveMedia({
      mediaFile: post.image,
      postId: newPost.id,
      type: MediaType.landingImage,
    }),
    saveMedia({
      mediaFile: post.video,
      postId: newPost.id,
      type: MediaType.mainVideo,
    }),
  ]);

  if (!imageUrl || !videoUrl) {
    throw new Error("Échec du téléchargement du fichier média");
  }

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

  const upload = await uploadToCloudinary(mediaFile, {
    folder: "posts",
    transformation: [{ width: 1200, crop: "limit" }],
  });

  if (!upload) {
    throw new Error("Échec du téléchargement du fichier média");
  }

  const mediaUrl = upload.secure_url;

  const media = await prisma.media.create({
    data: {
      url: mediaUrl,
      postId: postId,
      mimetype: mediaFile.type,
      type: type,
      filename: mediaFile.name,
      metadata: {
        width: upload.width,
        height: upload.height,
        format: upload.format,
        resource_type: upload.resource_type,
        public_id: upload.public_id,
        duration: upload.duration,
      },
    },
  });

  return media;
};
