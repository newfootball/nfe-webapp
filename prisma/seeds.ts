import { createPrismaClient } from "../src/lib/create-prisma-client";
import { seedComments } from "./seeds/comments";
import { seedFavorites } from "./seeds/favorites";
import { seedFollows } from "./seeds/follows";
import { seedLikes } from "./seeds/likes";
import { seedMedias } from "./seeds/medias";
import { seedMessages } from "./seeds/messages";
import { seedNotifications } from "./seeds/notifications";
import { seedPosts } from "./seeds/posts";
import { seedSignals } from "./seeds/signals";
import { seedUsers } from "./seeds/users";

const prisma = createPrismaClient();

const main = async () => {
	const users = await seedUsers(prisma);
	const posts = await seedPosts({ prisma, users });
	await seedMedias({ prisma, posts });
	await seedFollows({ prisma, users });
	await seedMessages({ prisma, users });
	await seedSignals({ prisma, posts, users });
	await seedLikes({ prisma, posts, users });
	await seedComments({ prisma, posts, users });
	await seedFavorites({ prisma, posts, users });
	await seedNotifications({ prisma, posts, users });
};

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
