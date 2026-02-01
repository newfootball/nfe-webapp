"use server";

import { prisma } from "@/lib/prisma";
import type { MessageUser } from "../types";

export async function searchUsers(query: string): Promise<MessageUser[]> {
	if (!query.trim()) {
		return [];
	}

	const users = await prisma.user.findMany({
		where: {
			OR: [
				{ name: { contains: query, mode: "insensitive" } },
				{ email: { contains: query, mode: "insensitive" } },
			],
		},
		select: {
			id: true,
			name: true,
			image: true,
		},
		take: 10,
	});

	return users.map((user) => ({
		id: user.id,
		username: user.name || "Unknown",
		image:
			user.image ||
			`https://api.dicebear.com/9.x/adventurer/svg?seed=${user.id}`,
	}));
}
