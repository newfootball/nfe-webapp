import { faker } from "@faker-js/faker/locale/fr";
import {
	PostStatus,
	type Prisma,
	type PrismaClient,
	SpamScore,
} from "@prisma/client";
import { randomizer } from "../../src/lib/array";

export const seedPosts = async ({
	prisma,
	users,
}: {
	prisma: PrismaClient;
	users: Prisma.UserCreateInput[];
}) => {
	const posts: Prisma.PostUncheckedCreateInput[] = [];
	for (const user of users) {
		const nbPosts = Math.floor(Math.random() * 8) + 3;

		for (let i = 0; i < nbPosts; i++) {
			const dbPost = await prisma.post.create({ data: postData(user) });
			posts.push(dbPost);
		}
	}

	return posts;
};

function postData(
	user: Prisma.UserCreateInput,
): Prisma.PostUncheckedCreateInput {
	if (!user.id) {
		throw new Error("User id is required to create a post");
	}

	const createdAt = faker.date.past();
	const spamScore = getSpamScore();
	const status = getPostStatus();

	return {
		createdAt,
		spamScore,
		status,
		updatedAt: faker.date.between({ from: createdAt, to: new Date() }),
		expiresAt: faker.date.between({
			from: createdAt,
			to: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
		}),
		validatedAt:
			spamScore === SpamScore.SUSPECT
				? faker.date.between({
						from: createdAt,
						to: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
					})
				: null,
		title: faker.lorem.sentence(),
		slug: faker.lorem.slug(),
		description: faker.lorem.paragraphs(),
		userId: user.id,
	} satisfies Prisma.PostUncheckedCreateInput;
}

function getPostStatus(): PostStatus {
	return randomizer([
		PostStatus.PUBLISHED,
		PostStatus.PUBLISHED,
		PostStatus.PUBLISHED,
		PostStatus.PUBLISHED,
		PostStatus.PUBLISHED,
		PostStatus.DRAFT,
		PostStatus.PENDING,
		PostStatus.REJECTED,
	]) as PostStatus;
}

function getSpamScore(): SpamScore | undefined {
	return randomizer([
		SpamScore.NONE,
		SpamScore.NONE,
		SpamScore.NONE,
		SpamScore.NONE,
		SpamScore.NONE,
		SpamScore.SPAM,
		SpamScore.SUSPECT,
		SpamScore.SUSPECT,
	]);
}
