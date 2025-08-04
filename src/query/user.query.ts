"use server";

import { auth } from "@/lib/auth";
import { comparePassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export const getUserLogin = async (email: string, password: string) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { name: email }],
      },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await comparePassword(
      password,
      user?.password ?? "",
    );

    if (!isPasswordValid) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    return userWithoutPassword;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

/**
 * Returns the user ID of the authenticated user, or null if there is no authenticated user.
 */
export const getUserSessionId = async (): Promise<string | null> => {
  try {
    const session = await auth();

    return session?.user?.id ?? null;
  } catch (error) {
    console.error("Error getting user session:", error);
    return null;
  }
};

export const getUserSession = async (): Promise<User | null> => {
  const userId = await getUserSessionId();

  if (userId) return getUser(userId);

  return null;
};

export const getUser = async (userId: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    return null;
  }

  return user;
};

export const getUserRole = async (userId: string): Promise<string | null> => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      role: true,
    },
  });

  return user?.role ?? null;
};

export const getUsers = async ({
  page,
  limit = 10,
}: {
  page: number;
  limit: number;
}): Promise<User[]> => {
  const users = await prisma.user.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
  });

  return users;
};

export async function getUsersForSitemap() {
  try {
    const users = await prisma.user.findMany({
      where: {
        isOnboarded: true,
        // Exclure les utilisateurs sans contenu public
        posts: {
          some: {
            status: "PUBLISHED",
          },
        },
      },
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 500, // Limiter pour performance
    });

    return users;
  } catch (error) {
    console.error("Error fetching users for sitemap:", error);
    return [];
  }
}
