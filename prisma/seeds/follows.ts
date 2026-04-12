import type { Prisma, PrismaClient } from "@prisma/client";

export const seedFollows = async ({
	prisma,
	users,
}: {
	prisma: PrismaClient;
	users: Prisma.UserCreateInput[];
}) => {
	const usersWithId = users.filter((u) => u.id) as (Prisma.UserCreateInput & {
		id: string;
	})[];

	if (usersWithId.length < 2) return;

	const followed = new Set<string>();

	for (const user of usersWithId) {
		const nbFollowing = Math.floor(Math.random() * 8) + 2;
		const candidates = usersWithId.filter((u) => u.id !== user.id);

		for (let i = 0; i < Math.min(nbFollowing, candidates.length); i++) {
			const target = candidates[Math.floor(Math.random() * candidates.length)];
			if (!target) continue;

			const key = `${user.id}:${target.id}`;
			if (followed.has(key)) continue;
			followed.add(key);

			await prisma.follow.create({
				data: {
					followerId: user.id,
					followingId: target.id,
				},
			});
		}
	}
};
