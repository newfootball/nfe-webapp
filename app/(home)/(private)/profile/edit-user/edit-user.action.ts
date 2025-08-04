"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
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

  // Update language cookie if language was changed
  if (parsedData.data.language) {
    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", parsedData.data.language, {
      path: "/",
      maxAge: 31536000, // 1 year
      sameSite: "lax",
    });

    // Revalidate to refresh the page with new language
    revalidatePath("/", "layout");
  }

  return user;
};
