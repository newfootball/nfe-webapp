import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
	return new PrismaClient();
};

declare const globalForPrisma: {
	prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof globalThis;

const globalWithPrisma = globalThis as unknown as typeof globalForPrisma;

export const prisma = globalWithPrisma.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production")
	globalWithPrisma.prismaGlobal = prisma;
