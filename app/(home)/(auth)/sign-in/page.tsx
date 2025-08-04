import { GoogleButton } from "@/components/auth/google-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { AuthLanguageSelector } from "@/src/components/language/auth-language-selector";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SignInForm } from "./signin-form";

export default function SignInPage() {
  const t = useTranslations("sign-in");

  return (
    <div className="flex justify-center items-center pt-20">
      <Card className="mx-auto max-w-sm shadow-none border-none">
        <CardHeader>
          <div className="flex justify-between items-start mb-4">
            <div>
              <CardTitle className="text-2xl">{t("sign-in")}</CardTitle>
              <CardDescription>
                {t("enter-your-email-below-to-sign-in")}
              </CardDescription>
            </div>
            <AuthLanguageSelector />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <SignInForm />

            <Divider text={t("or-continue-with")} />

            <GoogleButton />
          </div>

          <div className="mt-4 text-center text-sm">
            {t("dont-have-an-account")}{" "}
            <Link href="/sign-up" className="underline">
              {t("sign-up")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
