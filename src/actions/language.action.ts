"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSupportedLocale } from "@/src/lib/locale";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function updateUserLanguage(language: string) {
  try {
    if (!isSupportedLocale(language)) {
      return { error: "Unsupported language" };
    }

    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Unauthorized" };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { language },
    });

    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", language, {
      path: "/",
      maxAge: 31536000, // 1 year
      sameSite: "lax",
    });

    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("Error updating user language:", error);
    return { error: "Failed to update language preference" };
  }
}

export async function setGuestLanguage(language: string) {
  try {
    if (!isSupportedLocale(language)) {
      return { error: "Unsupported language" };
    }

    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", language, {
      path: "/",
      maxAge: 31536000, // 1 year
      sameSite: "lax",
    });

    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("Error setting guest language:", error);
    return { error: "Failed to set language preference" };
  }
}

export async function initializeUserLanguage() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: true };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { language: true },
    });

    if (!user?.language) {
      const cookieStore = await cookies();
      const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

      if (cookieLocale && isSupportedLocale(cookieLocale)) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { language: cookieLocale },
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error initializing user language:", error);
    return { error: "Failed to initialize language preference" };
  }
}
