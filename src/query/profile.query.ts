"use server";

import { prisma } from "@/lib/prisma";
import { EDITABLE_PROFILE_SELECT } from "@/src/query/profile.select";
import { getUserSessionId } from "@/src/query/user.query";

export async function getEditableProfile() {
	const userId = await getUserSessionId();
	if (!userId) return null;

	return prisma.user.findUnique({
		where: { id: userId },
		select: EDITABLE_PROFILE_SELECT,
	});
}
