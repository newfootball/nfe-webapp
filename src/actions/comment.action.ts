"use server";

import { prisma } from "@/lib/prisma";
import {
  type CommentFormData,
  CommentSchema,
} from "@/src/schemas/comment.schema";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

export const saveComment = async (data: CommentFormData) => {
  const t = await getTranslations("actions.comment");

  try {
    // Validate the input data
    const validatedData = CommentSchema.parse(data);

    const comment = await prisma.comment.create({
      data: validatedData,
    });

    return { success: true, data: comment };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors };
    }
    console.error("Error saving comment:", error);

    return {
      success: false,
      error: [
        {
          message: t("error-saving-comment"),
        },
      ],
    };
  }
};
