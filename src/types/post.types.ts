import { Media, Post, Prisma, User } from "@prisma/client";

export type PostWithMedias = Prisma.PostGetPayload<{
	include: {
		medias: true;
	};
}>;

export type PostWithUserAndMedias = Post & {
	user: User;
	medias: Media[];
	_count: {
		comments: number;
		likes: number;
	};
};
