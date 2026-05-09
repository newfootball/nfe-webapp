import { faker } from "@faker-js/faker/locale/fr";
import {
	type Prisma,
	type PrismaClient,
	SignalReason,
	SignalStatus,
} from "@/src/generated/prisma/client";
import { randomizer } from "../../src/lib/array";

const ALL_REASONS = Object.values(SignalReason);
const ALL_STATUSES = [
	SignalStatus.PENDING,
	SignalStatus.PENDING,
	SignalStatus.PENDING,
	SignalStatus.REVIEWED,
	SignalStatus.DISMISSED,
];

export const seedSignals = async ({
	prisma,
	posts,
	users,
}: {
	prisma: PrismaClient;
	posts: Prisma.PostUncheckedCreateInput[];
	users: Prisma.UserCreateInput[];
}) => {
	const postsWithId = posts.filter(
		(p) => p.id,
	) as (Prisma.PostUncheckedCreateInput & { id: string })[];
	const usersWithId = users.filter((u) => u.id) as (Prisma.UserCreateInput & {
		id: string;
	})[];

	if (postsWithId.length === 0 || usersWithId.length < 2) return;

	const targetPosts = postsWithId.slice(0, Math.min(10, postsWithId.length));
	const signaled = new Set<string>();

	for (const post of targetPosts) {
		const reporter = usersWithId.find(
			(u) => u.id !== post.userId && !signaled.has(`${post.id}:${u.id}`),
		);
		if (!reporter) continue;

		const key = `${post.id}:${reporter.id}`;
		signaled.add(key);

		const reason = randomizer(ALL_REASONS) ?? SignalReason.OTHER;
		const status = randomizer(ALL_STATUSES) ?? SignalStatus.PENDING;

		await prisma.postSignal.create({
			data: {
				postId: post.id,
				userId: reporter.id,
				reason,
				status,
				details: Math.random() > 0.5 ? faker.lorem.sentence() : null,
			},
		});
	}
};
