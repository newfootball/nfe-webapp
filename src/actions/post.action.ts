"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUserSessionId } from "../query/user.query";

export async function deletePost(postId: string) {
  try {
    const userId = await getUserSessionId();
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Verify the post belongs to the user
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true },
    });

    if (!post || post.userId !== userId) {
      throw new Error("Unauthorized to delete this post");
    }

    // Delete the post and all related data (comments, likes, favorites)
    await prisma.post.delete({
      where: { id: postId },
    });

    revalidatePath("/post/my");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting post:", error);
    return { error: "Failed to delete post" };
  }
}
