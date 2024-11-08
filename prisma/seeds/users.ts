import { faker } from "@faker-js/faker";
import type { Prisma, PrismaClient } from "@prisma/client";

export const seedUsers = async (prisma: PrismaClient) => {
	const users: Prisma.UserCreateInput[] = [];
	for (let i = 0; i < 20; i++) {
		const dbUser = await prisma.user.create({ data: userData() });
		users.push(dbUser);
	}

	return users;
};

const userData = (): Prisma.UserCreateInput => {
	const person = {
		firstname: faker.person.firstName(),
		lastname: faker.person.lastName(),
	};

	const regularUser = {
		...person,
		...{
			email: faker.internet.email({ firstName: person.firstname }),
			name: faker.internet.username({ firstName: person.firstname }),
			image: faker.image.avatar(),
		},
	};

	return {
		...regularUser,
	} satisfies Prisma.UserCreateInput;
};
