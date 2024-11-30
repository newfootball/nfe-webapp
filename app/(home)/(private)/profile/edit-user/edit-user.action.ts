"use server";

import { prisma } from "@/lib/prisma";
import { type UserDataForm, userSchema } from "./user.schema";

export const updateUser = async (userId: string, data: UserDataForm) => {
	const parsedData = userSchema.safeParse(data);

	if (!parsedData.success) {
		throw new Error("Invalid data");
	}

	const user = await prisma.user.update({
		where: { id: userId },
		data: parsedData.data,
	});

	return user;
};
