import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/src/generated/prisma/client";
import { getDatabaseUrl } from "@/src/lib/database-url";

export function createPrismaClient() {
	const adapter = new PrismaPg({
		connectionString: getDatabaseUrl(),
	});

	return new PrismaClient({ adapter });
}
