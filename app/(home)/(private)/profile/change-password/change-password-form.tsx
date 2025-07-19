"use client";

import { Button } from "@/components/ui/button";
import { Password } from "@/components/ui/password";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";

export const ChangePasswordForm = () => {
  const t = useTranslations("profile.change-password");
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");

  // Créer le schéma avec les traductions
  const changePasswordSchema = z
    .object({
      currentPassword: z
        .string()
        .min(1, { message: t("current-password-required") }),
      password: z.string().min(8, { message: t("password-too-short") }),
      confirmPassword: z
        .string()
        .min(8, { message: t("confirm-password-too-short") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwords-do-not-match"),
      path: ["confirmPassword"],
    });

  const result = changePasswordSchema.safeParse({
    currentPassword,
    password,
    confirmPassword,
  });

  if (!result.success) {
    throw new Error(
      `Validation error: ${result.error.errors[0]?.message ?? t("error-on-change-password")}`,
    );
  }

  return (
    <form action="">
      <div className="grid w-full max-w-sm items-center">
        <Password
          label={t("current-password")}
          id="password"
          name="currentPassword"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

        <Password
          label={t("new-password")}
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Password
          label={t("confirm-new-password")}
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <Button className="w-full mt-2" type="submit">
        {t("change-password")}
      </Button>
      <div className="flex justify-center mt-4">
        <Link href="/profile">{t("back-to-profile")}</Link>
      </div>
    </form>
  );
};
