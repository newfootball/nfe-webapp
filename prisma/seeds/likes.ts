import type { Prisma, PrismaClient } from "@prisma/client";

export const seedLikes = async ({
	prisma,
	posts,
	users,
}: {
	prisma: PrismaClient;
	posts: Prisma.PostUncheckedCreateInput[];
	users: Prisma.UserCreateInput[];
}) => {
	const publishedPosts = posts.filter(
		(p) => p.id && p.status === "PUBLISHED",
	) as (Prisma.PostUncheckedCreateInput & { id: string })[];

	const usersWithId = users.filter((u) => u.id) as (Prisma.UserCreateInput & {
		id: string;
	})[];

	if (publishedPosts.length === 0 || usersWithId.length === 0) return;

	const liked = new Set<string>();

	for (const post of publishedPosts) {
		const nbLikes = Math.floor(Math.random() * 9);
		const candidates = [...usersWithId].sort(() => Math.random() - 0.5);

		for (let i = 0; i < Math.min(nbLikes, candidates.length); i++) {
			const user = candidates[i];
			if (!user) continue;

			const key = `${post.id}:${user.id}`;
			if (liked.has(key)) continue;
			liked.add(key);

			await prisma.like.create({
				data: { postId: post.id, userId: user.id },
			});
		}
	}
};
