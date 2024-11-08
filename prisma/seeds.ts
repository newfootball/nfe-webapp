import { PrismaClient } from "@prisma/client";
import { seedMedias } from "./seeds/medias";
import { seedPosts } from "./seeds/posts";
import { seedUsers } from "./seeds/users";

const prisma = new PrismaClient();

const main = async () => {
  const users = await seedUsers(prisma);
  const posts = await seedPosts({ prisma, users });
  await seedMedias({ prisma, posts });
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
