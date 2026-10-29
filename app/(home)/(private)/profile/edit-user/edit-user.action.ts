"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getUserSessionId } from "@/src/query/user.query";
import { userSchema } from "./user.schema";

export const updateUser = async (data: unknown) => {
	const t = await getTranslations("profile.edit-user");
	const userId = await getUserSessionId();
	if (!userId) {
		return { success: false, error: t("unauthorized") } as const;
	}

	const parsedData = userSchema.safeParse(data);

	if (!parsedData.success) {
		return { success: false, error: t("invalid-profile") } as const;
	}

	try {
		await prisma.user.update({
			where: { id: userId },
			data: parsedData.data,
			select: { id: true },
		});
	} catch {
		return { success: false, error: t("update-error") } as const;
	}

	revalidatePath("/profile");
	revalidatePath("/profile/edit-user");
	revalidatePath(`/user/${userId}`);
	return { success: true } as const;
};
