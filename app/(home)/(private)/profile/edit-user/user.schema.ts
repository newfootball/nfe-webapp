import { isSupportedLocale } from "@/src/lib/locale";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

export const createUserSchema = async () => {
  const t = await getTranslations("profile.edit-user");

  return z.object({
    email: z.string().email({ message: t("invalid-email") }),
    fullName: z.string().min(1, { message: t("full-name-required") }),
    biography: z.string().optional().nullable(),
    birthday: z.date().optional().nullable(),
    language: z
      .string()
      .refine((val) => isSupportedLocale(val), {
        message: "Invalid language",
      })
      .optional()
      .nullable(),
  });
};

export const userSchema = z.object({
  email: z.string().email(),
  fullName: z.string(),
  biography: z.string().optional().nullable(),
  birthday: z.date().optional().nullable(),
  language: z
    .string()
    .refine((val) => isSupportedLocale(val), {
      message: "Invalid language",
    })
    .optional()
    .nullable(),
});

export type UserDataForm = z.infer<typeof userSchema>;
