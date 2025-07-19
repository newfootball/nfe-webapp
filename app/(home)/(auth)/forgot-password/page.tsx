import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
	const t = useTranslations("forgot-password");

	return (
		<div className="flex justify-center items-center pt-20">
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">{t("forgot-password")}</CardTitle>
					<CardDescription>
						{t("enter-your-email-for-reset-instructions")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<ForgotPasswordForm />
					</div>

					<div className="mt-4 text-center text-sm">
						{t("remember-your-password")}{" "}
						<Link href="/sign-in" className="underline">
							{t("sign-in")}
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
