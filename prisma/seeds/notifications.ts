import type {
	NotificationType,
	Prisma,
	PrismaClient,
} from "@/src/generated/prisma/client";

const SAMPLES: Array<{
	type: NotificationType;
	content: (name: string) => string;
	makeLink: (id: string) => string;
}> = [
	{
		type: "LIKE",
		content: (n) => `${n} a aimé ton post`,
		makeLink: (id) => `/post/${id}`,
	},
	{
		type: "COMMENT",
		content: (n) => `${n} a commenté ton post`,
		makeLink: (id) => `/post/${id}`,
	},
	{
		type: "FOLLOW",
		content: (n) => `${n} te suit maintenant`,
		makeLink: (id) => `/user/${id}`,
	},
	{
		type: "MESSAGE",
		content: (n) => `${n} t'a envoyé un message`,
		makeLink: (id) => `/messages/${id}`,
	},
	{
		type: "LIKE",
		content: (n) => `${n} a aimé ton post`,
		makeLink: (id) => `/post/${id}`,
	},
	{
		type: "COMMENT",
		content: (n) => `${n} a laissé un commentaire`,
		makeLink: (id) => `/post/${id}`,
	},
];

export const seedNotifications = async ({
	prisma,
	posts,
	users,
}: {
	prisma: PrismaClient;
	posts: Prisma.PostUncheckedCreateInput[];
	users: Prisma.UserCreateInput[];
}) => {
	const usersWithId = users.filter((u) => u.id) as (Prisma.UserCreateInput & {
		id: string;
	})[];
	const publishedPosts = posts.filter(
		(p) => p.id && p.status === "PUBLISHED",
	) as (Prisma.PostUncheckedCreateInput & { id: string })[];

	if (usersWithId.length < 2 || publishedPosts.length === 0) return;

	const now = new Date();

	// Seed notifications for every user (so any logged-in user sees data)
	for (const recipient of usersWithId) {
		const actors = usersWithId.filter((u) => u.id !== recipient.id);
		if (actors.length === 0) continue;

		for (let i = 0; i < 10; i++) {
			const actor = actors[i % actors.length];
			const sample = SAMPLES[i % SAMPLES.length];
			if (!actor || !sample) continue;
			const refId =
				sample.type === "FOLLOW" || sample.type === "MESSAGE"
					? actor.id
					: (publishedPosts[i % publishedPosts.length]?.id ?? actor.id);

			const minutesAgo = i * 17 + Math.floor(Math.random() * 15);
			const createdAt = new Date(now.getTime() - minutesAgo * 60 * 1000);
			const readAt = i >= 4 ? new Date(createdAt.getTime() + 60_000) : null;

			await prisma.notification.create({
				data: {
					userId: recipient.id,
					type: sample.type,
					content: sample.content(actor.name ?? actor.fullName ?? "Quelqu'un"),
					link: sample.makeLink(refId),
					readAt,
					createdAt,
				},
			});
		}
	}
};
