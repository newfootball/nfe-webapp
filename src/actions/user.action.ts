"use server";

import { signOut } from "next-auth/react";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const deleteUserAccount = async () => {
  const t = await getTranslations("actions.user");
  const session = await auth();
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
  signOut();

  return user;
};
