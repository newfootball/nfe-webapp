import { faker } from "@faker-js/faker/locale/fr";
import type { Prisma, PrismaClient } from "@/src/generated/prisma/client";

export const seedComments = async ({
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

	for (const post of publishedPosts) {
		const nbComments = Math.floor(Math.random() * 6);
		const candidates = [...usersWithId].sort(() => Math.random() - 0.5);

		for (let i = 0; i < Math.min(nbComments, candidates.length); i++) {
			const user = candidates[i];
			if (!user) continue;

			await prisma.comment.create({
				data: {
					postId: post.id,
					userId: user.id,
					content: faker.lorem.sentence(),
					createdAt: faker.date.recent({ days: 30 }),
				},
			});
		}
	}
};
