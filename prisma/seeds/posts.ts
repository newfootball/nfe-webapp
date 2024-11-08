import { faker } from "@faker-js/faker/locale/fr";
import { Prisma, PrismaClient, SpamScore } from "@prisma/client";
import { randomizer } from "../../src/lib/array";

export const seedPosts = async ({
  prisma,
  users,
}: {
  prisma: PrismaClient;
  users: Prisma.UserCreateInput[];
}) => {
  const posts: Prisma.PostUncheckedCreateInput[] = [];
  for (let user of users) {
    const nbPosts = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < nbPosts; i++) {
      const dbPost = await prisma.post.create({ data: postData(user) });
      posts.push(dbPost);
    }
  }

  return posts;
};

function postData(
  user: Prisma.UserCreateInput
): Prisma.PostUncheckedCreateInput {
  if (!user.id) {
    throw new Error("User id is required to create a post");
  }

  const createdAt = faker.date.past();
  const spamScore = getSpamScore();

  return {
    createdAt,
    spamScore,
    updatedAt: faker.date.between({ from: createdAt, to: new Date() }),
    // expires  after 30 days from creation
    expiresAt: faker.date.between({
      from: createdAt,
      to: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    }),
    // if suspect, set a validation date in 1 day after creation
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

function getSpamScore(): SpamScore {
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
