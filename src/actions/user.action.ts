"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "../lib/auth-server";
import { prisma } from "../lib/prisma";

export const deleteUserAccount = async () => {
	const t = await getTranslations("actions.user");
	const session = await getSession();
	const userId = session?.user?.id;

	if (!userId) {
		throw new Error(t("user-not-found"));
	}

	const user = await prisma.user.delete({
		where: {
			id: userId,
		},
	});

	revalidatePath("/");
	redirect("/sign-in");

	return user;
};
