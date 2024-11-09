import { faker } from "@faker-js/faker/locale/fr";
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomizer } from "../../lib/array";
export const seedMessages = async ({
	prisma,
	users,
}: {
	prisma: PrismaClient;
	users: Prisma.UserCreateInput[];
}) => {
	const messages: Prisma.MessageUncheckedCreateInput[] = [];

	for (const user of users) {
		const nbMessages = Math.floor(Math.random() * 5) + 1;

		for (let i = 0; i < nbMessages; i++) {
			const dbMessage = await prisma.message.create({
				data: messageData(user, users),
			});
			messages.push(dbMessage);
		}
	}

	return messages;
};

function messageData(
	user: Prisma.UserCreateInput,
	users: Prisma.UserCreateInput[],
): Prisma.MessageUncheckedCreateInput {
	return {
		toUserId: user.id as string,
		fromUserId: randomizer(users)?.id as string,
		content: faker.lorem.paragraph(),
	};
}
