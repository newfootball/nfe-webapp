import type { Prisma, PrismaClient } from "@prisma/client";

export const seedFavorites = async ({
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

	const favorited = new Set<string>();

	for (const user of usersWithId) {
		const nbFavorites = Math.floor(Math.random() * 5);
		const candidates = [...publishedPosts].sort(() => Math.random() - 0.5);

		for (let i = 0; i < Math.min(nbFavorites, candidates.length); i++) {
			const post = candidates[i];
			if (!post) continue;

			const key = `${post.id}:${user.id}`;
			if (favorited.has(key)) continue;
			favorited.add(key);

			await prisma.favorite.create({
				data: { postId: post.id, userId: user.id },
			});
		}
	}
};
