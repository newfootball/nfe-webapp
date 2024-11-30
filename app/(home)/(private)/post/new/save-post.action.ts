"use server";

import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { PostType } from "@prisma/client";
import { getSession } from "next-auth/react";
import { type PostData, postSchema } from "./post.schema";

export const savePost = async (post: PostData) => {
	const session = await getSession();
	const user = session?.user as User;

	if (!user.id) {
		throw new Error("User not found");
	}

	const result = postSchema.safeParse(post);
	if (!result.success) {
		throw new Error(result.error.errors[0].message);
	}

	const newPost = await prisma.post.create({
		data: {
			...post,
			userId: user.id,
			slug: post.title.toLowerCase().replace(/ /g, "-"),
			type: PostType.video,
		},
	});

	return newPost;
};
