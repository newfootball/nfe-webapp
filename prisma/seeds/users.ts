import { faker } from "@faker-js/faker";
import {
	Foot,
	Position,
	type Prisma,
	type PrismaClient,
	UserType,
} from "@/src/generated/prisma/client";
import { randomizer, selectRandomItems } from "../../src/lib/array";
import { hashPassword } from "../../src/lib/password";

const ALL_POSITIONS = Object.values(Position);
const ALL_FEET = Object.values(Foot);
const PLAYER_TYPES = [
	UserType.PLAYER,
	UserType.COACH,
	UserType.RECRUITER,
	UserType.CLUB,
];

const UNSPLASH_AVATARS = [
	"https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1552667466-07770ae110d0?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1504305754058-2f08ccd89a0a?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1459865264687-595d652de67e?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1551958219-acbc595b8b7a?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1524786151921-8ec37f68e9c5?w=200&h=200&fit=crop",
	"https://images.unsplash.com/photo-1610201429291-9e23e3c0b7a7?w=200&h=200&fit=crop",
];

export const seedUsers = async (prisma: PrismaClient) => {
	const users: Prisma.UserCreateInput[] = [];

	const adminPassword = await hashPassword("Admin1234!");
	const adminUser = await prisma.user.create({
		data: {
			email: "admin@nfe-foot.com",
			name: "admin",
			fullName: "Admin NFE",
			password: adminPassword,
			role: "ADMIN",
			isOnboarded: true,
			emailVerified: true,
			userType: UserType.PLAYER,
			image: UNSPLASH_AVATARS[0],
			biography: "Administrateur de la plateforme NFE.",
			localisation: "Paris",
		},
	});

	await prisma.account.create({
		data: {
			userId: adminUser.id,
			accountId: adminUser.id,
			providerId: "credential",
			password: adminPassword,
		},
	});

	users.push(adminUser);

	for (let i = 0; i < 20; i++) {
		const dbUser = await prisma.user.create({ data: await userData() });
		users.push(dbUser);
	}

	return users;
};

const userData = async (): Promise<Prisma.UserCreateInput> => {
	const fullName = faker.person.fullName();
	const userType = randomizer(PLAYER_TYPES) ?? UserType.PLAYER;
	const isPlayer = userType === UserType.PLAYER;

	const position = isPlayer
		? selectRandomItems(ALL_POSITIONS, Math.floor(Math.random() * 3) + 1)
		: [];

	const foot = isPlayer
		? selectRandomItems(ALL_FEET, Math.random() > 0.3 ? 1 : 2)
		: [];

	return {
		email: faker.internet.email({ firstName: fullName }),
		name: faker.internet.username({ firstName: fullName }),
		fullName,
		image: randomizer(UNSPLASH_AVATARS) ?? UNSPLASH_AVATARS[0],
		isOnboarded: true,
		userType,
		biography: faker.lorem.sentence(),
		localisation: faker.location.city(),
		birthday: faker.date.birthdate({ min: 16, max: 40, mode: "age" }),
		position,
		foot,
	} satisfies Prisma.UserCreateInput;
};
