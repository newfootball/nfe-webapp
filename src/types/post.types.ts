import type { Prisma } from "@/src/generated/prisma/client";
import type { POST_WITH_PUBLIC_USER_INCLUDE } from "@/src/query/post.select";

export type PostWithMedias = Prisma.PostGetPayload<{
	include: {
		medias: true;
	};
}>;

export type PostWithUserAndMedias = Prisma.PostGetPayload<{
	include: typeof POST_WITH_PUBLIC_USER_INCLUDE;
}>;

export type PostsPage = {
	posts: PostWithUserAndMedias[];
	nextCursor: string | null;
};
