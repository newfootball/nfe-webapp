import type { PrismaClient } from "@/src/generated/prisma/client";
import { createPrismaClient } from "@/src/lib/create-prisma-client";

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}
